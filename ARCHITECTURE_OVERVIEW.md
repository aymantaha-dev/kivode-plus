# Architecture Overview

## Runtime Model

Kivode+ Desktop uses a multi-process architecture:

1. **Main process** (`src/main`)
   - Owns IPC, privileged file access, task execution, and security policies.
2. **Renderer process** (`src/renderer`)
   - Provides user interface and invokes privileged actions through constrained APIs.
3. **Python sandbox runtime** (`src/main/python`, `resources/python`)
   - Executes isolated analysis/generation tasks with policy controls.

## Security-Critical Layers

- `src/main/security/filesystem-policy.ts`
- `src/main/security/command-policy.ts`
- `src/main/security/redaction.ts`
- `src/main/security/update-policy.ts`

These modules must remain authoritative for policy enforcement.

## Service Layer

Primary service modules in `src/main/services`:
- AI provider orchestration,
- repository and file management,
- Python environment management,
- sandbox task orchestration,
- persistent store and project analysis.

## Frontend Composition

`src/renderer/src/components` is organized by panel-centric UX:
- editor, sidebar, preview, AI panel,
- GitHub integration and repository analysis,
- settings and onboarding.

## Build and Packaging

- Renderer: Vite
- Main: TypeScript compiler
- Packaging: electron-builder
- Verification: custom scripts in `scripts/`

## Additional Design References

- Arabic implementation blueprint for local coding agent runtime: `docs/LOCAL_CODE_AGENT_RUNTIME_PLAN_AR.md`
