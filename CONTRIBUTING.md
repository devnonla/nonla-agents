# Contributing to Nonla Agents

Thank you for your interest in contributing to Nonla Agents! 🎉

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.4
- [Git](https://git-scm.com/)

### Setup

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/nonla-agents.git
cd nonla-agents

# Install dependencies
bun install

# Start dev servers (API + Vite HMR)
bun run dev
```

The dev server will be available at `http://localhost:15123`.

## Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** — follow the project's coding style.

3. **Lint & format** before committing:
   ```bash
   bun run biome:check
   ```

4. **Commit** with a clear message:
   ```
   feat: add new tool type for HTTP requests
   fix: resolve websocket reconnection issue
   docs: update CLI reference
   ```

5. **Push** and open a Pull Request against `main`.

## Branch Naming

| Prefix    | Usage                  |
| --------- | ---------------------- |
| `feat/`   | New features           |
| `fix/`    | Bug fixes              |
| `docs/`   | Documentation changes  |
| `refactor/` | Code refactoring     |
| `chore/`  | Build, CI, tooling     |

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

## Pull Requests

- Keep PRs focused — one feature or fix per PR.
- Fill in the PR template.
- Ensure lint passes (`bun run biome:check`).
- Add a clear description of what changed and why.
- Link related issues using `Closes #123`.

## Reporting Bugs

Please use the [Bug Report](https://github.com/devnonla/nonla-agents/issues/new?template=bug_report.md) issue template.

Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment info (OS, Bun version, etc.)

## Requesting Features

Please use the [Feature Request](https://github.com/devnonla/nonla-agents/issues/new?template=feature_request.md) issue template.

## Code Style

- **TypeScript** for all source code
- **Biome** for linting and formatting (config in `biome.json`)
- Keep functions small and focused
- Use meaningful variable and function names

## Project Structure

```
nonla-agents/
├── bin/            # CLI entry point
├── src/
│   ├── server/     # Hono backend (API, WebSocket, DB)
│   └── web/        # React frontend (Vite, Tailwind)
├── public/         # Built frontend assets
├── scripts/        # Build & deploy scripts
└── docs/           # Documentation
```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
