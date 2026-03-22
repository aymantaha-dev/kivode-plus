# Architecture Overview

## Main process modules/services
- `src/main/main.ts`: Browser window, IPC routing, CSP/network gate, app lifecycle.
- `src/main/services/GitHubManager.ts` + `src/main/services/GitHubService.ts`: single GitHub integration stack.
- `src/main/services/FileManager.ts`: file operations guarded by centralized filesystem policy.
- `src/main/services/StoreManager.ts`: settings and API-key presence state.
- `src/main/services/SandboxService.ts` and `src/main/services/PythonEnvService.ts`: isolated Python runtime orchestration.
- `src/main/services/TaskEngineService.ts`: task orchestration and safe command execution policy.

## Preload bridge API surface
- `src/main/preload.ts` exposes `electronAPI` namespaces: `file`, `github`, `ai`, `store`, `shell`, `updates`, `task`, `sandbox`, `clipboard`, and `app`.

## Renderer modules
- App shell and state: `src/renderer/src/App.tsx`, `src/renderer/src/stores/useAppStore.ts`.
- Security-sensitive UI: `SettingsPanel.tsx` (credentials/update checks), `PreviewPanel.tsx` (sanitized preview).

## Python runtime/sandbox components
- Bundled runtime bootstrap: `resources/python/bootstrap/ensure_env.py`.
- Runtime execution: `src/main/python/sandbox_runner.py`, `src/main/python/sandbox_policy.py`, `src/main/python/workspace_access.py`.
- Main-process wrapper: `SandboxService` enforces bundled runtime and rejects system Python fallback.

## Update mechanism and release pipeline
- Renderer requests update checks through `updates:check` IPC.
- Main process validates URL using `src/main/security/update-policy.ts` (HTTPS + allowlisted domain).
- Build/package is driven by `npm run build:release` and electron-builder configs.

## Data flow
- Renderer → preload (`window.electronAPI`) → main IPC handlers → service layer → filesystem/network/python.
- Filesystem and update calls pass through central security policy modules before side effects.

## Diagram placeholders
- TODO: Sequence diagram for renderer-to-main IPC.
- TODO: Component diagram for sandboxed Python runtime.

## Additional Design References

- Arabic implementation blueprint for local coding agent runtime: `docs/LOCAL_CODE_AGENT_RUNTIME_PLAN_AR.md`
