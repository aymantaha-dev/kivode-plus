#!/usr/bin/env python3
import argparse
import ast
import difflib
import hashlib
import json
import py_compile
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MAX_FILE_SIZE = 300_000
IGNORE_DIRS = {'.git', 'node_modules', 'dist', 'build', '.next', '.idea', '.vscode', '__pycache__'}
TEXT_EXTENSIONS = {
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py', '.css', '.scss', '.html', '.yml', '.yaml', '.toml', '.rs', '.go', '.java', '.sh'
}

INTERNAL_STATE_DIR = '.kivode_agent'
SNAPSHOT_DIR = 'snapshots'
LAST_ERRORS_FILE = 'last_errors.json'
INDEX_DB_FILE = 'index.sqlite3'

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def ok(data: Dict[str, Any]):
    return {"ok": True, **data}


def fail(message: str):
    return {"ok": False, "error": message}


def is_text_file(path: Path) -> bool:
    plain_text_names = {
        'dockerfile', 'makefile', 'license', 'licence', 'copying', 'readme', 'changelog', 'authors', '.env.example'
    }
    return path.suffix.lower() in TEXT_EXTENSIONS or path.name.lower() in plain_text_names


def ensure_in_root(root: Path, target: Path) -> None:
    root_r = root.resolve()
    target_r = target.resolve()
    if root_r == target_r:
        return
    if root_r not in target_r.parents:
        raise ValueError('Path escape detected: writing outside project root is forbidden')


def rel_path(root: Path, path: Path) -> str:
    return str(path.resolve().relative_to(root.resolve())).replace('\\', '/')


def iter_files(root: Path):
    for current_root, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in files:
            p = Path(current_root) / f
            try:
                if p.stat().st_size > MAX_FILE_SIZE:
                    continue
            except OSError:
                continue
            if is_text_file(p):
                yield p


def extract_python_symbols(text: str) -> Dict[str, Any]:
    result = {"functions": [], "classes": [], "imports": []}
    try:
        tree = ast.parse(text)
    except Exception:
        return result

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            result["functions"].append({"name": node.name, "line_start": node.lineno, "line_end": getattr(node, 'end_lineno', node.lineno)})
        elif isinstance(node, ast.ClassDef):
            result["classes"].append({"name": node.name, "line_start": node.lineno, "line_end": getattr(node, 'end_lineno', node.lineno)})
        elif isinstance(node, ast.Import):
            for alias in node.names:
                result["imports"].append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ''
            for alias in node.names:
                result["imports"].append(f"{mod}.{alias.name}" if mod else alias.name)
    return result


def extract_generic_symbols(text: str, suffix: str) -> Dict[str, Any]:
    result = {"functions": [], "classes": [], "imports": []}
    lines = text.splitlines()

    if suffix in {'.ts', '.tsx', '.js', '.jsx'}:
        for i, line in enumerate(lines, start=1):
            fn_match = re.search(r'\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\b', line)
            if not fn_match:
                fn_match = re.search(r'\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(', line)
            if fn_match:
                result["functions"].append({"name": fn_match.group(1), "line_start": i, "line_end": i})

            class_match = re.search(r'\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\b', line)
            if class_match:
                result["classes"].append({"name": class_match.group(1), "line_start": i, "line_end": i})

            import_match = re.search(r'^\s*import\s+.*\s+from\s+[\"\']([^\"\']+)[\"\']', line)
            if import_match:
                result["imports"].append(import_match.group(1))

    elif suffix in {'.md'}:
        for i, line in enumerate(lines, start=1):
            heading = re.match(r'^\s{0,3}#{1,6}\s+(.+)$', line)
            if heading:
                result["classes"].append({"name": heading.group(1).strip(), "line_start": i, "line_end": i})

    return result


def index_project(root: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for path in iter_files(root):
        try:
            content = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        entry = {"path": rel_path(root, path), "symbols": {"functions": [], "classes": [], "imports": []}}
        if path.suffix.lower() == '.py':
            entry["symbols"] = extract_python_symbols(content)
        else:
            entry["symbols"] = extract_generic_symbols(content, path.suffix.lower())
        out.append(entry)
    out.sort(key=lambda item: item.get("path", ""))
    return out


def _tokenize_query(query: str) -> List[str]:
    normalized = re.sub(r'[^\w\u0600-\u06FF]+', ' ', query.lower()).strip()
    stop_words = {
        'the', 'a', 'an', 'to', 'in', 'on', 'for', 'and', 'or', 'of', 'is', 'are', 'please', 'file', 'page',
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
    }
    return [t for t in normalized.split() if len(t) > 1 and t not in stop_words]


def _score_path(path_text: str, tokens: List[str]) -> int:
    p = path_text.lower()
    return sum(3 for t in tokens if t in p)


def _intent_path_bias(query: str, path_text: str) -> int:
    q = query.lower()
    p = path_text.lower()
    bias = 0

    seo_a11y_request = any(term in q for term in [
        'seo', 'accessibility', 'a11y', 'meta', 'aria', 'semantic', 'schema',
        '', ' ', ' ', ''
    ])
    translation_request = any(term in q for term in [
        'translation', 'locale', 'i18n', 'l10n', 'language file',
        '', '', '', 'localization'
    ])

    is_locale_file = bool(re.search(r'(^|/)(language|lang|locales|i18n)(/|$)', p)) or bool(re.search(r'(^|/)ar\.(js|json|ts)$', p))
    is_html_like = p.endswith('.html') or p.endswith('.htm') or p.endswith('.tsx') or p.endswith('.jsx')
    is_entry_page = bool(re.search(r'(^|/)(index|home|main|app|page)\.(html|tsx|jsx)$', p))

    if seo_a11y_request:
      if is_entry_page:
          bias += 10
      elif is_html_like:
          bias += 6
      if is_locale_file:
          bias -= 10

    if translation_request:
      if is_locale_file:
          bias += 8
      elif is_html_like:
          bias -= 2

    return bias


def search_project(root: Path, query: str, mode: str = 'keyword', limit: int = 10) -> List[Dict[str, Any]]:
    q = query.strip()
    if not q:
        return []

    tokens = _tokenize_query(q)
    results = []
    rgx = None
    if mode == 'regex':
        rgx = re.compile(q, flags=re.IGNORECASE)

    for path in iter_files(root):
        try:
            content = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue

        path_rel = rel_path(root, path)
        lines = content.splitlines()
        matches: List[Tuple[int, str]] = []
        lexical_score = _score_path(path_rel, tokens)

        for i, line in enumerate(lines, start=1):
            matched = False
            if mode == 'function_name':
                matched = re.search(rf'\b(def|function)\s+{re.escape(q)}\b', line, flags=re.IGNORECASE) is not None
            elif mode == 'regex' and rgx:
                matched = rgx.search(line) is not None
            else:
                hay = line.lower()
                if tokens:
                    matched = any(t in hay for t in tokens)
                else:
                    matched = q.lower() in hay

            if matched:
                snippet = line[:300]
                matches.append((i, snippet))
                hay = snippet.lower()
                lexical_score += 1 + sum(1 for t in tokens if t in hay)
            if len(matches) >= 4:
                break

        if not matches:
            continue

        symbol_bonus = 0
        if path.suffix.lower() == '.py':
            symbols = extract_python_symbols(content)
        else:
            symbols = extract_generic_symbols(content, path.suffix.lower())

        symbol_names = [s.get('name', '').lower() for s in symbols.get('functions', []) + symbols.get('classes', [])]
        if tokens and symbol_names:
            symbol_bonus = sum(2 for t in tokens if any(t in name for name in symbol_names))

        intent_bias = _intent_path_bias(q, path_rel)
        score = max(1, lexical_score + symbol_bonus + intent_bias)
        results.append({
            "path": path_rel,
            "score": score,
            "matches": [{"line": ln, "text": tx} for ln, tx in matches],
            "symbol_hits": symbol_bonus,
            "intent_bias": intent_bias,
        })

    results.sort(key=lambda item: item.get('score', 0), reverse=True)
    return results[:max(1, limit)]


def unified_diff(old: str, new: str, file_path: str) -> str:
    return ''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True), fromfile=f'a/{file_path}', tofile=f'b/{file_path}'))


def replace_python_function_body(file_content: str, function_name: str, new_body: str) -> str:
    lines = file_content.splitlines()
    tree = ast.parse(file_content)
    target = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name:
            target = node
            break
    if target is None:
        raise ValueError(f'Function not found: {function_name}')

    if not target.body:
        raise ValueError('Target function has empty body')

    start = target.body[0].lineno
    end = getattr(target.body[-1], 'end_lineno', target.body[-1].lineno)
    indent_match = re.match(r'^(\s*)', lines[start - 1] if start - 1 < len(lines) else '    ')
    indent = indent_match.group(1) if indent_match else '    '

    new_body_lines = [indent + b if b.strip() else '' for b in new_body.splitlines()]
    if not new_body_lines:
        new_body_lines = [indent + 'pass']

    updated = lines[:start - 1] + new_body_lines + lines[end:]
    return '\n'.join(updated) + ('\n' if file_content.endswith('\n') else '')


def create_file(root: Path, relative: str, content: str) -> Dict[str, Any]:
    safe = relative.replace('\\', '/').strip().lstrip('./')
    if not safe or '..' in safe.split('/'):
        raise ValueError('Unsafe file path')
    target = (root / safe)
    ensure_in_root(root, target)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')
    return {"path": safe, "size": len(content)}


def _agent_state_dir(root: Path) -> Path:
    target = root / INTERNAL_STATE_DIR
    ensure_in_root(root, target)
    target.mkdir(parents=True, exist_ok=True)
    return target


def _safe_run(root: Path, cmd: List[str], timeout_s: int = 90) -> Dict[str, Any]:
    if not cmd:
        return {"ok": False, "exit_code": 1, "stdout": "", "stderr": "empty command"}

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=max(1, timeout_s),
            env={**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'},
        )
        return {
            "ok": proc.returncode == 0,
            "exit_code": proc.returncode,
            "stdout": (proc.stdout or '')[:16000],
            "stderr": (proc.stderr or '')[:16000],
            "command": ' '.join(cmd),
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "exit_code": 124, "stdout": "", "stderr": "command timeout", "command": ' '.join(cmd)}
    except Exception as exc:
        return {"ok": False, "exit_code": 1, "stdout": "", "stderr": str(exc), "command": ' '.join(cmd)}


def _has_tool(binary: str) -> bool:
    if _self_contained_mode():
        if binary == 'python':
            return Path(_bundled_python()).exists()
        return False
    return shutil.which(binary) is not None


def _self_contained_mode() -> bool:
    return os.environ.get('KIVODE_SELF_CONTAINED', '1') != '0'


def _bundled_python() -> str:
    return os.environ.get('KIVODE_BUNDLED_PYTHON', sys.executable)





def _python_compile_check(root: Path) -> Dict[str, Any]:
    errors: List[str] = []
    checked = 0
    for file_path in iter_files(root):
        if file_path.suffix.lower() != '.py':
            continue
        checked += 1
        try:
            py_compile.compile(str(file_path), doraise=True)
        except Exception as exc:
            errors.append(f"{rel_path(root, file_path)}: {exc}")
            if len(errors) >= 20:
                break
    return {
        "ok": len(errors) == 0,
        "exit_code": 0 if len(errors) == 0 else 1,
        "checked_files": checked,
        "stdout": '' if len(errors) == 0 else '\n'.join(errors),
        "stderr": '' if len(errors) == 0 else '\n'.join(errors),
        "command": 'internal:py_compile',
    }

def _write_last_errors(root: Path, errors: List[Dict[str, Any]]) -> None:
    state = _agent_state_dir(root)
    payload = {
        "updated_at": datetime.utcnow().isoformat() + 'Z',
        "errors": errors,
    }
    (state / LAST_ERRORS_FILE).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def _read_last_errors(root: Path) -> Dict[str, Any]:
    state = _agent_state_dir(root)
    target = state / LAST_ERRORS_FILE
    if not target.exists():
        return {"updated_at": None, "errors": []}
    try:
        return json.loads(target.read_text(encoding='utf-8'))
    except Exception:
        return {"updated_at": None, "errors": []}


def run_validations(root: Path, paths: Optional[List[str]] = None, tests: Optional[List[str]] = None) -> Dict[str, Any]:
    selected_paths = [p for p in (paths or []) if isinstance(p, str) and p.strip()]
    selected_tests = [t for t in (tests or []) if isinstance(t, str) and t.strip()]

    checks: List[Tuple[str, List[str], str]] = []
    checks.append(('format', [], 'syntax/compile check (internal)'))

    if not _self_contained_mode() and _has_tool('ruff'):
        checks.append(('lint', ['ruff', 'check', '.'], 'ruff lint'))
    if not _self_contained_mode() and _has_tool('pytest'):
        checks.append(('tests', ['pytest', '-q', *(selected_tests or [])], 'pytest targeted'))

    results: Dict[str, Any] = {}
    failures: List[Dict[str, Any]] = []
    for key, command, label in checks:
        res = _python_compile_check(root) if key == 'format' else _safe_run(root, command)
        res['label'] = label
        if selected_paths:
            res['paths'] = selected_paths
        results[key] = res
        if not res.get('ok'):
            failures.append({
                "tool": key,
                "command": res.get('command'),
                "exit_code": res.get('exit_code'),
                "message": (res.get('stderr') or res.get('stdout') or '').splitlines()[:20],
            })

    if _self_contained_mode():
        results['lint'] = {"ok": True, "skipped": True, "reason": 'Disabled in strict self-contained mode unless bundled linter is configured.'}
        results['tests'] = {"ok": True, "skipped": True, "reason": 'Disabled in strict self-contained mode unless bundled test runner is configured.'}

    _write_last_errors(root, failures)
    return {
        "summary": "Validation passed" if not failures else "Validation completed with failures",
        "results": results,
        "ok": not failures,
    }


def create_snapshot(root: Path, note: str = '') -> Dict[str, Any]:
    state = _agent_state_dir(root)
    snap_root = state / SNAPSHOT_DIR
    snap_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime('%Y%m%d-%H%M%S-%f')
    snapshot_id = f'snap-{stamp}'
    target = snap_root / snapshot_id
    target.mkdir(parents=True, exist_ok=True)

    for file_path in iter_files(root):
        rel = rel_path(root, file_path)
        if rel.startswith(f"{INTERNAL_STATE_DIR}/"):
            continue
        dst = target / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(file_path, dst)
        except OSError:
            continue

    meta = {
        "snapshot_id": snapshot_id,
        "created_at": datetime.utcnow().isoformat() + 'Z',
        "note": note[:500],
    }
    (target / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    return meta


def rollback_snapshot(root: Path, snapshot_id: str) -> Dict[str, Any]:
    if not snapshot_id:
        raise ValueError('snapshot_id is required')
    state = _agent_state_dir(root)
    source = state / SNAPSHOT_DIR / snapshot_id
    ensure_in_root(root, source)
    if not source.exists() or not source.is_dir():
        raise ValueError('snapshot not found')

    restored = 0
    for path in source.rglob('*'):
        if path.name == 'meta.json' or not path.is_file():
            continue
        rel = str(path.relative_to(source)).replace('\\', '/')
        dst = root / rel
        ensure_in_root(root, dst)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dst)
        restored += 1
    return {"snapshot_id": snapshot_id, "restored_files": restored}


def _line_span(content: str, start_line: int, end_line: int) -> str:
    lines = content.splitlines()
    s = max(1, start_line)
    e = max(s, end_line)
    return '\n'.join(lines[s - 1:e])


def read_file_span(root: Path, file_rel: str, start_line: int = 1, end_line: int = 200) -> Dict[str, Any]:
    rel = file_rel.replace('\\', '/').strip().lstrip('./')
    if not rel or '..' in rel.split('/'):
        raise ValueError('Unsafe file path')
    target = root / rel
    ensure_in_root(root, target)
    if not target.exists():
        raise ValueError('Target file does not exist')
    content = target.read_text(encoding='utf-8', errors='ignore')
    return {
        "path": rel,
        "start_line": max(1, int(start_line)),
        "end_line": max(1, int(end_line)),
        "content": _line_span(content, int(start_line), int(end_line)),
    }


def _extract_symbols_for_file(path: Path, content: str) -> Dict[str, Any]:
    if path.suffix.lower() == '.py':
        return extract_python_symbols(content)
    return extract_generic_symbols(content, path.suffix.lower())


def search_symbols(root: Path, query: str, limit: int = 25) -> List[Dict[str, Any]]:
    query_norm = query.strip().lower()
    if not query_norm:
        return []
    hits: List[Dict[str, Any]] = []
    for path in iter_files(root):
        rel = rel_path(root, path)
        try:
            content = path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        symbols = _extract_symbols_for_file(path, content)
        for symbol_type in ('functions', 'classes'):
            for item in symbols.get(symbol_type, []):
                name = str(item.get('name', ''))
                if query_norm in name.lower():
                    hits.append({
                        "path": rel,
                        "symbol_name": name,
                        "symbol_type": symbol_type[:-1],
                        "start_line": item.get('line_start', 1),
                        "end_line": item.get('line_end', item.get('line_start', 1)),
                    })
    hits.sort(key=lambda h: (h['path'], h['symbol_name']))
    return hits[:max(1, int(limit))]


def get_repo_summary(root: Path) -> Dict[str, Any]:
    files = list(iter_files(root))
    lang_counts: Dict[str, int] = {}
    total_size = 0
    for f in files:
        suffix = (f.suffix.lower() or 'no_ext').lstrip('.')
        lang_counts[suffix] = lang_counts.get(suffix, 0) + 1
        try:
            total_size += f.stat().st_size
        except OSError:
            pass
    return {
        "root": str(root),
        "file_count": len(files),
        "size_bytes": total_size,
        "languages": dict(sorted(lang_counts.items(), key=lambda kv: kv[1], reverse=True)[:12]),
    }


def get_file_summary(root: Path, file_rel: str) -> Dict[str, Any]:
    rel = file_rel.replace('\\', '/').strip().lstrip('./')
    if not rel or '..' in rel.split('/'):
        raise ValueError('Unsafe file path')
    target = root / rel
    ensure_in_root(root, target)
    if not target.exists():
        raise ValueError('Target file does not exist')
    content = target.read_text(encoding='utf-8', errors='ignore')
    symbols = _extract_symbols_for_file(target, content)
    return {
        "path": rel,
        "lines": len(content.splitlines()),
        "chars": len(content),
        "imports": len(symbols.get('imports', [])),
        "functions": len(symbols.get('functions', [])),
        "classes": len(symbols.get('classes', [])),
        "preview": '\n'.join(content.splitlines()[:40]),
        "hash": hashlib.sha256(content.encode('utf-8', errors='ignore')).hexdigest(),
    }


def get_related_files(root: Path, file_rel: str, limit: int = 12) -> List[str]:
    rel = file_rel.replace('\\', '/').strip().lstrip('./')
    base = Path(rel).stem.lower()
    related: List[str] = []
    for p in iter_files(root):
        current = rel_path(root, p)
        low = current.lower()
        if current == rel:
            continue
        if base and base in low:
            related.append(current)
            continue
        if 'test' in low and Path(rel).parent.name and Path(rel).parent.name.lower() in low:
            related.append(current)
    related = sorted(set(related))
    return related[:max(1, int(limit))]


def get_changed_files(root: Path) -> List[str]:
    if _self_contained_mode():
        return []
    if not (root / '.git').exists() or not _has_tool('git'):
        return []
    result = _safe_run(root, ['git', 'status', '--porcelain'])
    if not result.get('ok') and not result.get('stdout'):
        return []
    files: List[str] = []
    for raw in (result.get('stdout') or '').splitlines():
        if len(raw) < 4:
            continue
        files.append(raw[3:].strip())
    return files


def _classify_intent(task: str) -> str:
    t = task.lower()
    if any(k in t for k in ['explain', 'اشرح', 'explanation']):
        return 'explain'
    if any(k in t for k in ['test', 'pytest', 'unit test', 'اختبار']):
        return 'generate_tests'
    if any(k in t for k in ['refactor', 'اعادة هيكلة']):
        return 'refactor'
    if any(k in t for k in ['error', 'bug', 'fix', 'failed', 'خطأ', 'اصلاح']):
        return 'analyze_error'
    return 'edit_code'


def plan_task(task: str) -> Dict[str, Any]:
    intent = _classify_intent(task)
    risk = 'high' if intent in {'refactor'} else 'medium' if intent in {'analyze_error'} else 'low'
    return {
        "intent": intent,
        "scope": "small",
        "read_more": True,
        "files_to_open": [],
        "symbols_to_open": [],
        "line_ranges": [],
        "needs_tests": intent in {'edit_code', 'analyze_error', 'generate_tests', 'refactor'},
        "risk_level": risk,
        "expected_output": "explanation" if intent == 'explain' else "patch",
    }


def retrieve_context(root: Path, task: str, max_files: int = 5, span_lines: int = 140) -> Dict[str, Any]:
    results = search_project(root, task, 'keyword', max_files)
    files: List[Dict[str, Any]] = []
    for hit in results[:max(1, int(max_files))]:
        rel = hit.get('path', '')
        try:
            opened = read_file_span(root, rel, 1, int(span_lines))
            files.append({
                "path": rel,
                "score": hit.get('score', 0),
                "matches": hit.get('matches', []),
                "span": opened.get('content', ''),
            })
        except Exception:
            continue
    return {
        "task": task,
        "repo_summary": get_repo_summary(root),
        "files": files,
    }


def strip_patch_fences(patch_text: str) -> str:
    cleaned = patch_text.strip()
    if cleaned.startswith('```'):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        cleaned = '\n'.join(lines)
    return cleaned


def _find_subsequence(lines: List[str], pattern: List[str], start: int = 0, normalize_ws: bool = False) -> int:
    if not pattern:
        return start

    def norm(v: str) -> str:
        if not normalize_ws:
            return v
        return ' '.join(v.strip().split())

    limit = len(lines) - len(pattern) + 1
    for i in range(max(0, start), max(0, limit)):
        ok_match = True
        for j, p in enumerate(pattern):
            if norm(lines[i + j]) != norm(p):
                ok_match = False
                break
        if ok_match:
            return i
    return -1


def _find_anchor_based_position(lines: List[str], pattern: List[str]) -> int:
    if not pattern:
        return -1

    normalized_pattern = [' '.join(item.strip().split()) for item in pattern]
    anchored_entries = [(idx, value) for idx, value in enumerate(normalized_pattern) if value]
    if not anchored_entries:
        return -1

    best_position = -1
    best_score = -1
    first_anchor_index, first_anchor_value = anchored_entries[0]

    for line_idx, current in enumerate(lines):
        if ' '.join(current.strip().split()) != first_anchor_value:
            continue

        candidate_start = line_idx - first_anchor_index
        if candidate_start < 0:
            continue

        end = candidate_start + len(pattern)
        if end > len(lines):
            continue

        score = 0
        for offset, expected in enumerate(normalized_pattern):
            if not expected:
                continue
            actual = ' '.join(lines[candidate_start + offset].strip().split())
            if actual == expected:
                score += 1

        if score > best_score:
            best_score = score
            best_position = candidate_start

    minimum_score = max(1, len(anchored_entries) // 2)
    if best_position >= 0 and best_score >= minimum_score:
        return best_position
    return -1



def apply_unified_patch(original: str, patch_text: str) -> str:
    src = original.splitlines()
    out: List[str] = []
    i = 0

    lines = patch_text.splitlines()
    idx = 0
    while idx < len(lines) and not lines[idx].startswith('@@'):
        idx += 1

    while idx < len(lines):
        header = lines[idx]
        if not header.startswith('@@'):
            idx += 1
            continue

        m = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", header)
        if not m:
            raise ValueError('Invalid patch hunk header')

        old_start = int(m.group(1)) - 1

        # copy untouched block before hunk
        while i < old_start and i < len(src):
            out.append(src[i])
            i += 1

        idx += 1
        while idx < len(lines) and not lines[idx].startswith('@@'):
            line = lines[idx]
            if not line:
                tag = ' '
                content = ''
            else:
                tag = line[0]
                content = line[1:] if len(line) > 1 else ''

            if tag == ' ':
                if i >= len(src) or src[i] != content:
                    raise ValueError('Patch context mismatch')
                out.append(src[i])
                i += 1
            elif tag == '-':
                if i >= len(src) or src[i] != content:
                    raise ValueError('Patch removal mismatch')
                i += 1
            elif tag == '+':
                out.append(content)
            elif tag == '\\':
                # "\ No newline at end of file"
                pass
            else:
                raise ValueError(f'Unsupported patch line: {line[:20]}')
            idx += 1

    while i < len(src):
        out.append(src[i])
        i += 1

    return '\n'.join(out) + ('\n' if original.endswith('\n') else '')


def apply_unified_patch_fallback(original: str, patch_text: str) -> str:
    out = original.splitlines()
    lines = patch_text.splitlines()
    idx = 0
    cursor = 0

    while idx < len(lines):
        if not lines[idx].startswith('@@'):
            idx += 1
            continue

        idx += 1
        hunk_body: List[str] = []
        while idx < len(lines) and not lines[idx].startswith('@@'):
            hunk_body.append(lines[idx])
            idx += 1

        old_block: List[str] = []
        new_block: List[str] = []
        for line in hunk_body:
            if not line:
                tag = ' '
                content = ''
            else:
                tag = line[0]
                content = line[1:] if len(line) > 1 else ''

            if tag == ' ':
                old_block.append(content)
                new_block.append(content)
            elif tag == '-':
                old_block.append(content)
            elif tag == '+':
                new_block.append(content)
            elif tag == '\\':
                continue
            else:
                raise ValueError(f'Unsupported patch line: {line[:20]}')

        if not old_block and new_block:
            insert_at = min(cursor, len(out))
            out[insert_at:insert_at] = new_block
            cursor = insert_at + len(new_block)
            continue

        pos = _find_subsequence(out, old_block, start=cursor, normalize_ws=False)
        if pos < 0:
            pos = _find_subsequence(out, old_block, start=0, normalize_ws=False)
        if pos < 0:
            pos = _find_subsequence(out, old_block, start=cursor, normalize_ws=True)
        if pos < 0:
            pos = _find_subsequence(out, old_block, start=0, normalize_ws=True)
        if pos < 0:
            pos = _find_anchor_based_position(out, old_block)

        if pos < 0:
            raise ValueError('Patch fallback failed to locate target block')

        out[pos:pos + len(old_block)] = new_block
        cursor = pos + len(new_block)

    return '\n'.join(out) + ('\n' if original.endswith('\n') else '')


def apply_patch_action(root: Path, command: Dict[str, Any]) -> Dict[str, Any]:
    file_rel = command.get('file')
    patch_text = command.get('patch', '')
    if not file_rel or not isinstance(patch_text, str) or not patch_text.strip():
        return fail('file and patch are required')

    file_path = (root / file_rel)
    ensure_in_root(root, file_path)
    if not file_path.exists():
        return fail('Target file does not exist')

    old = file_path.read_text(encoding='utf-8', errors='ignore')
    cleaned_patch = strip_patch_fences(patch_text)

    try:
        new = apply_unified_patch(old, cleaned_patch)
        strategy = 'strict'
    except ValueError as strict_error:
        if 'Patch removal mismatch' not in str(strict_error) and 'Patch context mismatch' not in str(strict_error):
            return fail(str(strict_error))
        try:
            new = apply_unified_patch_fallback(old, cleaned_patch)
            strategy = 'fallback'
        except ValueError as fallback_error:
            return fail(str(fallback_error))

    return ok({
        "file": file_rel,
        "before": old,
        "after": new,
        "diff": unified_diff(old, new, file_rel),
        "patchStrategy": strategy,
    })


def persist_index_sqlite(root: Path, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    state = _agent_state_dir(root)
    db_path = state / INDEX_DB_FILE
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute('CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, language TEXT, file_hash TEXT, modified_at TEXT, size_bytes INTEGER, summary TEXT)')
        conn.execute('CREATE TABLE IF NOT EXISTS symbols(path TEXT, symbol_name TEXT, symbol_type TEXT, start_line INTEGER, end_line INTEGER)')
        conn.execute('DELETE FROM files')
        conn.execute('DELETE FROM symbols')

        for entry in entries:
            rel = str(entry.get('path', ''))
            target = root / rel
            language = Path(rel).suffix.lower().lstrip('.')
            try:
                content = target.read_text(encoding='utf-8', errors='ignore')
                stat = target.stat()
            except OSError:
                continue
            content_hash = hashlib.sha256(content.encode('utf-8', errors='ignore')).hexdigest()
            summary = '\n'.join(content.splitlines()[:12])
            conn.execute(
                'INSERT OR REPLACE INTO files(path, language, file_hash, modified_at, size_bytes, summary) VALUES (?,?,?,?,?,?)',
                (rel, language, content_hash, datetime.utcfromtimestamp(stat.st_mtime).isoformat() + 'Z', stat.st_size, summary[:1200]),
            )
            symbols = entry.get('symbols', {})
            for stype in ('functions', 'classes'):
                for s in symbols.get(stype, []):
                    conn.execute(
                        'INSERT INTO symbols(path, symbol_name, symbol_type, start_line, end_line) VALUES (?,?,?,?,?)',
                        (rel, s.get('name', ''), stype[:-1], int(s.get('line_start', 1)), int(s.get('line_end', s.get('line_start', 1)))),
                    )
        conn.commit()
    finally:
        conn.close()

    return {"db_path": str(db_path), "files": len(entries)}

def handle(root: Path, command: Dict[str, Any]) -> Dict[str, Any]:
    action = command.get('action')
    if action == 'summarize_attachment':
        name = str(command.get('name', 'attachment')).strip() or 'attachment'
        encoding = str(command.get('encoding', 'utf-8')).lower()
        raw_content = command.get('content', '')
        if not isinstance(raw_content, str) or raw_content == '':
            return fail('Attachment content is required')

        if encoding == 'base64':
            try:
                import base64
                decoded = base64.b64decode(raw_content, validate=False)
                content = decoded.decode('utf-8', errors='ignore')
            except Exception:
                return fail('Failed to decode base64 attachment content')
        else:
            content = raw_content

        lines = content.splitlines()
        snippet = '\n'.join(lines[:80])
        suffix = Path(name).suffix.lower()
        symbols = extract_python_symbols(content) if suffix == '.py' else extract_generic_symbols(content, suffix)

        return ok({
            'name': name,
            'encoding': encoding,
            'summary': {
                'chars': len(content),
                'lines': len(lines),
                'functions': len(symbols.get('functions', [])),
                'classes': len(symbols.get('classes', [])),
                'imports': len(symbols.get('imports', [])),
                'preview': snippet,
            }
        })
    if action == 'load_attachment':
        name = str(command.get('name', 'attachment')).strip() or 'attachment'
        encoding = str(command.get('encoding', 'utf-8')).lower()
        raw_content = command.get('content', '')
        if not isinstance(raw_content, str) or raw_content == '':
            return fail('Attachment content is required')

        if encoding == 'base64':
            try:
                import base64
                decoded = base64.b64decode(raw_content, validate=False)
                content = decoded.decode('utf-8', errors='ignore')
            except Exception:
                return fail('Failed to decode base64 attachment content')
        else:
            content = raw_content

        return ok({
            'name': name,
            'content': content,
            'encoding': 'utf-8',
            'chars': len(content),
            'lines': len(content.splitlines()),
        })
    if action == 'analyze_project':
        entries = index_project(root)
        return ok({"index": entries})
    if action == 'index_project_cache':
        entries = index_project(root)
        return ok({"index": entries, "cache": persist_index_sqlite(root, entries)})
    if action == 'list_project_files':
        return ok({"files": [rel_path(root, p) for p in iter_files(root)]})
    if action == 'search_files':
        return ok({"results": search_project(root, command.get('query', ''), command.get('mode', 'keyword'), int(command.get('limit', 20)) )})
    if action == 'search_symbols':
        return ok({"results": search_symbols(root, str(command.get('query', '')), int(command.get('limit', 25)) )})
    if action == 'smart_search':
        return ok({"results": search_project(root, command.get('query', ''), command.get('mode', 'keyword'), int(command.get('limit', 10)))})
    if action == 'replace_body':
        file_rel = command.get('file')
        target_name = command.get('target_name')
        new_body = command.get('new_body', '')
        if not file_rel or not target_name:
            return fail('file and target_name are required')
        file_path = (root / file_rel)
        ensure_in_root(root, file_path)
        old = file_path.read_text(encoding='utf-8', errors='ignore')
        new = replace_python_function_body(old, target_name, new_body)
        return ok({"file": file_rel, "before": old, "after": new, "diff": unified_diff(old, new, file_rel)})
    if action == 'apply_patch':
        return apply_patch_action(root, command)
    if action == 'open_file':
        rel = str(command.get('path', '')).replace('\\', '/').strip().lstrip('./')
        if not rel or '..' in rel.split('/'):
            return fail('Unsafe file path')
        file_path = (root / rel)
        ensure_in_root(root, file_path)
        if not file_path.exists():
            return fail('Target file does not exist')
        content = file_path.read_text(encoding='utf-8', errors='ignore')
        return ok({"path": rel, "content": content})
    if action == 'read_file':
        try:
            return ok(read_file_span(root, str(command.get('path', '')), int(command.get('start_line', 1)), int(command.get('end_line', 200))))
        except Exception as exc:
            return fail(str(exc))
    if action == 'read_symbol':
        query = str(command.get('symbol_name', '')).strip()
        hits = search_symbols(root, query, int(command.get('limit', 5)))
        if not hits:
            return fail('Symbol not found')
        top = hits[0]
        return ok(read_file_span(root, top['path'], int(top['start_line']) - 10, int(top['end_line']) + 20))
    if action == 'create_file':
        info = create_file(root, command.get('path', ''), command.get('content', ''))
        return ok({"created": info})
    if action == 'get_repo_summary':
        return ok({"summary": get_repo_summary(root)})
    if action == 'get_file_summary':
        try:
            return ok({"summary": get_file_summary(root, str(command.get('path', '')))})
        except Exception as exc:
            return fail(str(exc))
    if action == 'get_related_files':
        return ok({"files": get_related_files(root, str(command.get('path', '')), int(command.get('limit', 12)))})
    if action == 'get_changed_files':
        return ok({"files": get_changed_files(root)})
    if action == 'plan_task':
        return ok({"plan": plan_task(str(command.get('task', '')))})
    if action == 'retrieve_context':
        return ok({"context": retrieve_context(root, str(command.get('task', '')), int(command.get('max_files', 5)), int(command.get('span_lines', 140)))})
    if action == 'create_snapshot':
        try:
            return ok({"snapshot": create_snapshot(root, str(command.get('note', '')))})
        except Exception as exc:
            return fail(str(exc))
    if action == 'rollback_snapshot':
        try:
            return ok({"rollback": rollback_snapshot(root, str(command.get('snapshot_id', '')))})
        except Exception as exc:
            return fail(str(exc))
    if action == 'get_last_errors':
        return ok({"errors": _read_last_errors(root)})
    if action == 'run_format':
        command_paths = command.get('paths', []) if isinstance(command.get('paths', []), list) else []
        return ok({"result": run_validations(root, command_paths, [])})
    if action == 'run_lint':
        command_paths = command.get('paths', []) if isinstance(command.get('paths', []), list) else []
        return ok({"result": run_validations(root, command_paths, [])})
    if action == 'run_tests':
        targets = command.get('targets', []) if isinstance(command.get('targets', []), list) else []
        return ok({"result": run_validations(root, [], targets)})
    if action == 'run_build':
        if _self_contained_mode():
            return ok({"result": {"ok": True, "skipped": True, "reason": 'Disabled in strict self-contained mode unless a bundled build tool is configured.'}})
        if _has_tool('npm'):
            return ok({"result": _safe_run(root, ['npm', 'run', 'build'])})
        if _has_tool('pnpm'):
            return ok({"result": _safe_run(root, ['pnpm', 'build'])})
        return ok({"result": {"ok": True, "skipped": True, "reason": 'No build tool found'}})
    if action == 'validate':
        paths = command.get('paths', []) if isinstance(command.get('paths', []), list) else []
        tests = command.get('tests', []) if isinstance(command.get('tests', []), list) else []
        return ok({"validation": run_validations(root, paths, tests)})
    return fail(f'Unknown action: {action}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=True)
    parser.add_argument('--payload', required=True)
    args = parser.parse_args()

    root = Path(args.project).resolve()
    if not root.exists() or not root.is_dir():
        print(json.dumps(fail('Invalid project path'), ensure_ascii=True))
        return

    try:
        payload = json.loads(args.payload)
    except json.JSONDecodeError:
        print(json.dumps(fail('Invalid JSON payload'), ensure_ascii=True))
        return

    try:
        response = handle(root, payload)
    except Exception as e:
        response = fail(str(e))
    print(json.dumps(response, ensure_ascii=True))


if __name__ == '__main__':
    main()
