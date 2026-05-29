# Contributing to Smart AI Bridge

Thanks for your interest in contributing. This document covers how to file issues, propose changes, and run the test suite locally.

## Filing Issues

- **Bug reports**: include the SAB version (`smart-ai-bridge --version` or `package.json`), Node.js version (`node -v`), the backend being routed to, and a minimal reproduction (tool name + input → unexpected output).
- **Feature requests**: describe the use case first, then the proposed API or behavior. If it touches an existing tool, note whether it changes the public surface.
- **Security issues**: please open a private security advisory via GitHub's "Report a vulnerability" flow on the repo's Security tab rather than a public issue.

Before filing, search existing issues — many edge cases are already tracked.

## Development Setup

```bash
git clone https://github.com/Platano78/smart-ai-bridge.git
cd smart-ai-bridge
npm install
```

Node 18+ required. The project uses ES modules (`"type": "module"` in package.json).

### Running the server locally

```bash
npm start              # stdio MCP server
node src/server.js     # equivalent
```

To connect from Claude Code:

```bash
claude mcp add smart-ai-bridge -- node /absolute/path/to/smart-ai-bridge/src/server.js
```

### Configuring backends

Backend configuration lives in `src/config/backends.json`. Set env vars for whichever providers you use:

```bash
export NVIDIA_API_KEY="..."
export OPENAI_API_KEY="..."
export GEMINI_API_KEY="..."
export GROQ_API_KEY="..."
```

You only need at least one working backend (a local model or one cloud API key).

## Tests

The project uses [Vitest](https://vitest.dev/):

```bash
npm test               # one-shot run
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
npm run test:bench     # performance benchmarks
```

All PRs must keep the suite green. Add tests for new tools or non-trivial bug fixes — see `tests/` for existing patterns (handler tests use a `TestHandler extends BaseHandler` pattern, parser tests use `describe / it / expect`).

## Code Style

- ES modules, single quotes, semicolons, 2-space indent.
- Handlers live in `src/handlers/`; shared utilities in `src/utils/`; backend adapters in `src/backends/`.
- Add or extend tools by editing `src/tools/tool-definitions.js` (schema) and adding the matching handler.
- Tool descriptions follow a documented template: one-sentence what + when, disambiguation against sibling tools, behavioral notes (destructive vs. read-only), explicit `Returns:` block. See existing tools for examples — Glama scores these heavily.

## Pull Requests

1. Fork the repo and branch from `main`.
2. Make your changes, keep commits focused (one logical change per commit).
3. Run `npm test` and `node --check` on any modified files.
4. Update `CHANGELOG.md` under the `## [Unreleased]` heading (create the section if it doesn't exist).
5. Open the PR with a clear description: what changed, why, and any user-visible behavior change.
6. CI (Test Suite + Dependency Audit + Secret Detection) must pass before merge.

## Architectural Notes

- **No backwards-compat shims for removed tools.** If a tool is removed, it's gone — callers will see "tool not found". The `validate_changes` removal in v2.5.0 is the precedent.
- **Backend config is the public API.** Adding a new provider should be a JSON entry first, code second.
- **Token-saving is a load-bearing feature.** `analyze_file` / `batch_analyze` / `modify_file` / `generate_file` exist specifically to keep file content out of the parent agent's context. New tools in that family should preserve the property.

## License

By contributing, you agree your contributions will be licensed under the Apache License 2.0 (same as the project).
