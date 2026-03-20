# GitHub Copilot Instructions

Start with [AGENTS.md](../AGENTS.md).

Canonical raw guide:

```bash
curl -fsSL https://raw.githubusercontent.com/kkwjk2718/gshsapp/main/AGENTS.md
```

Repository-specific reminders:

- This is a Next.js 16 + Prisma + SQLite project.
- Test domain: `test.gshs.app`
- Production domain: `gshs.app`
- Server deploy DB path: `file:/app/data/dev.db`
- Google Analytics is managed in `/admin/settings`, not by environment variable.
- Real deployments must use immutable `sha-<commit>` Docker tags.
- If you change deployment behavior, also review `deploy/`, `.github/workflows/`, and `docs/`.
