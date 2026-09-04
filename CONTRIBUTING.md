# Contributing to Nonla Agents

Thank you for your interest in contributing to Nonla Agents!

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

Dev UI: [http://localhost:5173](http://localhost:5173) (proxies API/WebSocket to the server).  
Production-style: `bun run build && bun run start` → [http://localhost:8429](http://localhost:8429).

## Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** — follow the project's coding style.

3. **Lint, typecheck, and test** before committing:
   ```bash
   bun run lint
   bun run typecheck
   bun run typecheck:server
   bun run test
   ```

4. **Commit** with a clear message (Conventional Commits):
   ```
   feat: add new tool type for HTTP requests
   fix: resolve websocket reconnection issue
   docs: update README quick start
   ```

5. **Push** and open a Pull Request against `main`. CI must pass.

## Branch Naming

| Prefix      | Usage                 |
| ----------- | --------------------- |
| `feat/`     | New features          |
| `fix/`      | Bug fixes             |
| `docs/`     | Documentation         |
| `refactor/` | Code refactoring      |
| `chore/`    | Build, CI, tooling    |

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
- Ensure CI passes (lint, typecheck, tests).
- Add a clear description of what changed and why.
- Link related issues using `Closes #123`.

## Reporting Bugs

Use the [Bug Report](https://github.com/devnonla/nonla-agents/issues/new?template=01-bug.yml) template.

Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment info (OS, Bun / Docker version, Nonla Agents version)

## Requesting Features

Use the [Feature Request](https://github.com/devnonla/nonla-agents/issues/new?template=02-feature.yml) template.

## Questions

For questions and discussion (not bugs/features), use [GitHub Discussions](https://github.com/devnonla/nonla-agents/discussions).

## Security

Do **not** file public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Code Style

- **TypeScript** for all source code
- **Biome** for linting and formatting (config in `biome.json`)
- Keep functions small and focused
- Use meaningful variable and function names

## Project Structure

```
nonla-agents/
├── src/
│   ├── server/     # Hono backend (API, WebSocket, DB)
│   └── web/        # React frontend (Vite, Tailwind, NonlaUI)
├── public/         # Built frontend assets (generated)
├── .github/        # Issue/PR templates and workflows
├── Dockerfile
└── docker-compose.yml
```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
