# GitHub Copilot 작업 안내

작업을 시작하기 전에 [AGENTS.md](../AGENTS.md)를 먼저 읽습니다.

기준 문서 원본:

```bash
curl -fsSL https://raw.githubusercontent.com/kkwjk2718/gshsapp/main/AGENTS.md
```

저장소 전용 메모:

- 이 프로젝트는 Next.js 16 + Prisma + SQLite 기반입니다.
- 테스트 도메인은 `test.gshs.app`입니다.
- 운영 도메인은 `gshs.app`입니다.
- 서버 배포 DB 경로는 `file:/app/data/dev.db`입니다.
- Google Analytics는 환경 변수가 아니라 `/admin/settings`에서 관리합니다.
- 실제 배포는 항상 불변 `sha-<commit>` Docker 태그를 사용합니다.
- 배포 동작을 바꾸면 `deploy/`, `.github/workflows/`, `docs/`도 함께 확인합니다.
