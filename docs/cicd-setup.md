# GitHub Actions CI/CD 설정 가이드

이 문서는 저장소 기준으로 GitHub Actions, Docker Hub, 테스트 서버, 운영 서버를 연결하는 방법을 설명합니다.

## 목표 구조

- PR / push: CI 실행
- `main` push: Docker 이미지 빌드 및 Docker Hub 푸시
- `main` push: 테스트 서버 자동 배포
- 수동 실행: 운영 서버 배포

## 워크플로우 파일

- [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- [.github/workflows/publish-and-deploy-test.yml](../.github/workflows/publish-and-deploy-test.yml)
- [.github/workflows/deploy-prod.yml](../.github/workflows/deploy-prod.yml)

## 1. Docker Hub 준비

필요한 것:

- Docker Hub 계정
- `gshsapp` 저장소
- push 가능한 access token

GitHub repository secrets에 아래를 추가합니다.

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## 2. GitHub Environments 만들기

Environments 두 개를 만듭니다.

- `test`
- `production`

권장 설정:

- `production`은 Required reviewers 켜기
- `test`와 `production` 각각 URL 입력

권장 URL:

- `test`: `https://test.gshs.app`
- `production`: `https://gshs.app`

## 3. Environment secrets 추가

각 environment에 아래 secrets를 추가합니다.

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`
- `KNOWN_HOSTS`

권장값 예시:

- `DEPLOY_PATH=/opt/gshsapp`
- `DEPLOY_PORT=22`

`KNOWN_HOSTS`는 아래처럼 수집할 수 있습니다.

```bash
ssh-keyscan -p 22 <server-ip>
```

## 4. SSH 키 준비

GitHub Actions 전용 키를 따로 만드는 것을 권장합니다.

로컬에서 생성:

```bash
ssh-keygen -t ed25519 -C "github-actions-gshsapp"
```

사용 위치:

- private key: GitHub `DEPLOY_SSH_KEY`
- public key: 서버 `~/.ssh/authorized_keys`

## 5. 브랜치 보호 규칙 권장

`main`에는 아래를 권장합니다.

- direct push 제한
- PR required
- status checks required
- required checks:
  - `lint`
  - `test`
  - `build`

## 6. 이미지 태그 정책

GitHub Actions는 아래 태그를 푸시합니다.

- `sha-<commit>`
- `main`
- `latest`

실제 배포에 사용하는 태그:

- 테스트 서버: `sha-<commit>`
- 운영 서버: `sha-<commit>`

사용하지 않는 기준:

- 운영 배포에서 `latest` 직접 사용 금지

## 7. 테스트 서버 자동 배포 흐름

`main`에 push되면:

1. `lint`
2. `test`
3. `build`
4. Docker Hub push
5. SSH로 테스트 서버 접속
6. `deploy/compose.yml`, `deploy.sh` 복사
7. 서버에서 `deploy.sh` 실행
8. SSH로 서버에 접속해 `127.0.0.1:1234` 기준 `/api/health`, `/`, `/menu`, `/notices` 확인

## 8. 운영 서버 수동 배포 흐름

GitHub Actions에서 `Deploy Production` 워크플로우를 직접 실행합니다.

입력값:

- `image_tag=sha-<commit>`

진행:

1. `production` environment 승인
2. SSH 접속
3. 배포 자산 복사
4. 지정한 SHA 이미지 pull
5. DB 백업
6. 컨테이너 갱신
7. 스모크 체크

## 9. 실패 시 확인할 것

GitHub Actions 실패 시 우선순위:

1. workflow 로그
2. Docker Hub 로그인 실패 여부
3. SSH 접속 실패 여부
4. 서버 `.env` 누락 여부
5. 서버 `docker compose logs`
6. `/api/health` 응답 여부

## 10. 새 테스트 서버를 붙일 때 순서

1. 새 Ubuntu VM 준비
2. [docs/server-bootstrap.md](./server-bootstrap.md) 기준으로 서버 세팅
3. GitHub Actions용 SSH 키 생성
4. GitHub `test` environment secrets 입력
5. 테스트 서버 `.env` 작성
6. 필요 시 `KNOWN_HOSTS` 갱신
7. `main` push 또는 workflow 재실행

## 11. 팀 운영 원칙

- 서버 접속 방법은 개인 계정이 아니라 배포 전용 사용자 기준으로 정리
- 구두 전달보다 문서 우선
- 새 시크릿이 생기면 문서와 GitHub settings를 함께 갱신
- 서버 구조가 바뀌면 `README`, `DEPLOY`, `docs/`, `deploy/README`를 같이 수정
