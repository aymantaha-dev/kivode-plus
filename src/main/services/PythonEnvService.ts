import { app } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface PythonEnvResult {
  ok: boolean;
  error?: string;
  [key: string]: any;
}

export interface PythonCommandPayload {
  action:
    | 'analyze_project'
    | 'index_project_cache'
    | 'smart_search'
    | 'search_files'
    | 'search_symbols'
    | 'replace_body'
    | 'apply_patch'
    | 'open_file'
    | 'read_file'
    | 'read_symbol'
    | 'create_file'
    | 'validate'
    | 'get_repo_summary'
    | 'get_file_summary'
    | 'get_related_files'
    | 'get_changed_files'
    | 'plan_task'
    | 'retrieve_context'
    | 'create_snapshot'
    | 'rollback_snapshot'
    | 'get_last_errors'
    | 'run_format'
    | 'run_lint'
    | 'run_tests'
    | 'run_build'
    | 'list_project_files'
    | 'summarize_attachment'
    | 'load_attachment';
  [key: string]: any;
}

interface SearchResultItem {
  path: string;
  matches?: Array<{ line: number; text: string }>;
}

interface PythonCandidate {
  bin: string;
  runtime: 'bundled';
}

export class PythonEnvService {
  private getPlatformKey(): string {
    const arch = process.arch;
    if (process.platform === 'win32') return arch === 'arm64' ? 'win32-arm64' : 'win32-x64';
    if (process.platform === 'darwin') return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    if (process.platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    return `${process.platform}-${arch}`;
  }

  private resolveBundledPythonBinary(): string | null {
    const platformKey = this.getPlatformKey();
    const platformBinary = process.platform === 'win32'
      ? path.join('runtime', platformKey, 'python.exe')
      : path.join('runtime', platformKey, 'bin', 'python3');

    const legacyBinary = process.platform === 'win32'
      ? path.join('runtime', 'python.exe')
      : path.join('runtime', 'python3');

    const candidates = [
      path.join(process.resourcesPath, 'python', platformBinary),
      path.join(process.resourcesPath, 'python', legacyBinary),
      path.join(app.getAppPath(), 'resources', 'python', platformBinary),
      path.join(app.getAppPath(), 'resources', 'python', legacyBinary),
      path.join(process.cwd(), 'resources', 'python', platformBinary),
      path.join(process.cwd(), 'resources', 'python', legacyBinary),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  }

  private resolvePythonCandidates(): PythonCandidate[] {
    const bundled = this.resolveBundledPythonBinary();
    return bundled ? [{ bin: bundled, runtime: 'bundled' }] : [];
  }

  private resolvePythonScriptPath(): string {
    const candidates = [
      path.join(process.resourcesPath, 'python', 'assistant_env.py'),
      path.join(app.getAppPath(), 'src', 'main', 'python', 'assistant_env.py'),
      path.join(process.cwd(), 'src', 'main', 'python', 'assistant_env.py'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    return candidates[0];
  }

  private runCandidate(pythonBin: string, scriptPath: string, projectPath: string, payload: PythonCommandPayload) {
    return new Promise<PythonEnvResult>((resolve, reject) => {
      execFile(
        pythonBin,
        [scriptPath, '--project', projectPath, '--payload', JSON.stringify(payload)],
        {
          timeout: 15000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', KIVODE_SELF_CONTAINED: '1', KIVODE_BUNDLED_PYTHON: pythonBin },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Python environment failed (${pythonBin}): ${stderr || error.message}`));
            return;
          }
          try {
            resolve(JSON.parse(stdout) as PythonEnvResult);
          } catch {
            reject(new Error(`Invalid response from Python environment (${pythonBin})`));
          }
        }
      );
    });
  }

  async execute(projectPath: string, payload: PythonCommandPayload): Promise<PythonEnvResult> {
    const scriptPath = this.resolvePythonScriptPath();
    const pythonCandidates = this.resolvePythonCandidates();

    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python helper script was not found at: ${scriptPath}`);
    }

    if (pythonCandidates.length === 0) {
      throw new Error('Bundled Python runtime is unavailable. System Python fallback is disabled by policy.');
    }

    let lastError: Error | null = null;
    for (const candidate of pythonCandidates) {
      try {
        return await this.runCandidate(candidate.bin, scriptPath, projectPath, payload);
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw lastError || new Error('Python runtime is unavailable');
  }

  async inspectProject(projectPath: string, query: string): Promise<PythonEnvResult> {
    const [indexResult, searchResult] = await Promise.all([
      this.execute(projectPath, { action: 'analyze_project' }),
      this.execute(projectPath, { action: 'smart_search', query, mode: 'keyword', limit: 20 }),
    ]);

    if (!indexResult?.ok) {
      return { ok: false, error: indexResult?.error || 'Failed to analyze project structure' };
    }

    if (!searchResult?.ok) {
      return {
        ok: true,
        project: projectPath,
        tree: (indexResult.index || []).slice(0, 120).map((item: any) => item.path),
        matches: [],
      };
    }

    const normalizedQuery = query.trim().toLowerCase();
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);

    const matches = (searchResult.results || []).map((item: any) => {
      const snippets = (item.matches || []).map((m: any) => ({ line: m.line, snippet: m.text }));
      const lexicalScore = snippets.reduce((score: number, snip: { snippet: string }) => {
        const haystack = (snip.snippet || '').toLowerCase();
        if (!terms.length) return score + 1;
        const matchedTerms = terms.filter((t) => haystack.includes(t)).length;
        return score + matchedTerms;
      }, 0);

      return {
        path: item.path,
        score: Math.max(1, lexicalScore + snippets.length),
        snippets,
      };
    })
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 8);

    const contextFiles = (searchResult.results || [])
      .slice(0, 6)
      .map((item: SearchResultItem) => {
        const absolutePath = path.join(projectPath, item.path);
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          return {
            path: item.path,
            excerpt: content.slice(0, 2000),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return {
      ok: true,
      project: projectPath,
      tree: (indexResult.index || []).slice(0, 120).map((item: any) => item.path),
      matches,
      contextFiles,
    };
  }

  async status() {
    const pythonCandidates = this.resolvePythonCandidates();
    const scriptPath = this.resolvePythonScriptPath();
    const bundledPython = this.resolveBundledPythonBinary();

    if (!fs.existsSync(scriptPath)) {
      return { available: false, scriptPath, runtime: app.isPackaged ? 'bundled' : 'system', error: 'assistant_env.py is missing' };
    }

    if (app.isPackaged && !bundledPython) {
      return { available: false, scriptPath, runtime: 'bundled', error: 'Bundled Python runtime is missing from resources/python/runtime/<platform-arch>' };
    }

    return new Promise<{ available: boolean; version?: string; scriptPath?: string; runtime?: 'bundled' | 'system'; pythonPath?: string; error?: string }>((resolve) => {
      const tryNext = (idx: number) => {
        if (idx >= pythonCandidates.length) {
          resolve({ available: false, scriptPath, runtime: app.isPackaged ? 'bundled' : 'system', error: 'No Python executable candidate succeeded' });
          return;
        }

        const candidate = pythonCandidates[idx];
        execFile(candidate.bin, ['--version'], { timeout: 4000 }, (error, stdout, stderr) => {
          if (error) {
            tryNext(idx + 1);
            return;
          }
          resolve({
            available: true,
            version: (stdout || stderr).trim(),
            scriptPath,
            runtime: candidate.runtime,
            pythonPath: candidate.bin,
          });
        });
      };

      tryNext(0);
    });
  }
}
