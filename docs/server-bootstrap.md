# 서버 부트스트랩 가이드

이 문서는 새 Ubuntu VM을 테스트 서버 또는 운영 서버로 준비할 때 사용하는 기준 문서입니다.

대상 상황:

- Proxmox 위에 새 Ubuntu VM을 만든 직후
- Docker, 배포 사용자, 배포 경로가 아직 준비되지 않은 상태

## 목표 상태

아래 조건이 만족되면 서버 준비가 완료된 것으로 봅니다.

- Docker Engine 설치 완료
- Docker Compose plugin 설치 완료
- 배포 전용 사용자 생성 완료
- `/opt/gshsapp` 디렉터리 준비 완료
- `.env`, `data/`, `backup/` 구조 준비 완료
- GitHub Actions self-hosted runner가 online 상태
- 리버스 프록시가 VM의 `1234` 포트로 연결 가능

## 권장 OS

- Ubuntu 24.04 LTS

## 1. 기본 패키지 설치

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg ufw
```

## 2. Docker 설치

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
```

확인:

```bash
docker --version
docker compose version
```

## 3. 배포 전용 사용자 생성

예시 사용자명은 `deploy`입니다.

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo mkdir -p /home/deploy/.ssh
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
```

## 4. 배포 디렉터리 준비

```bash
sudo mkdir -p /opt/gshsapp/data
sudo mkdir -p /opt/gshsapp/backup
sudo chown -R deploy:deploy /opt/gshsapp
```

최종 구조:

```text
/opt/gshsapp
  data/
  backup/
```

이후 self-hosted runner가 `compose.yml`, `deploy.sh` 등을 이 경로에 반영합니다.

## 5. 서버 `.env` 작성

`/opt/gshsapp/.env`를 직접 작성합니다.

테스트 서버 예시:

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-with-long-random-secret
AUTH_TRUST_HOST=true
AUTH_URL=https://test.gshs.app
NEXTAUTH_URL=https://test.gshs.app
NEXT_PUBLIC_APP_URL=https://test.gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

운영 서버 예시:

```dotenv
DATABASE_URL=file:/app/data/dev.db
AUTH_SECRET=replace-with-long-random-secret
AUTH_TRUST_HOST=true
AUTH_URL=https://gshs.app
NEXTAUTH_URL=https://gshs.app
NEXT_PUBLIC_APP_URL=https://gshs.app
NEXT_PUBLIC_NEIS_API_KEY=
```

주의 사항:

- `.env`는 저장소에 커밋하지 않습니다.
- 테스트와 운영 도메인을 섞지 않습니다.

## 6. 방화벽 및 네트워크

권장 기본값:

- SSH만 우선 허용
- 앱 포트 `1234`는 프록시가 접근할 수 있는 범위만 허용

예시:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

현재 기본 배포는 `0.0.0.0:1234` 바인딩을 사용합니다. 이는 프록시가 다른 호스트에 있을 수 있기 때문입니다.

## 7. 리버스 프록시 가정

현재 앱 컨테이너는 직접 TLS를 처리하지 않습니다.

즉, 아래 구성 중 하나를 가정합니다.

- Nginx
- Caddy
- Traefik
- 별도 로드밸런서 + 내부 프록시

프록시는 앱 VM의 `1234` 포트를 upstream으로 보게 됩니다.

## 8. 서버 준비 확인 명령

```bash
id deploy
docker --version
docker compose version
ls -la /opt/gshsapp
ls -la /opt/gshsapp/data
ls -la /opt/gshsapp/backup
```

## 9. GitHub Actions runner 연결 전 체크리스트

- [ ] 서버 IP 확인
- [ ] 배포 전용 사용자 준비
- [ ] `/opt/gshsapp/.env` 작성
- [ ] Docker 실행 가능 여부 확인
- [ ] `deploy` 사용자가 `docker ps` 가능한지 확인
- [ ] runner registration token 준비
- [ ] runner label 결정 (`gshs-test`, `gshs-prod`)
- [ ] runner 서비스 online 확인

## 10. 복원 리허설 관련 요구 사항

테스트 서버에서는 아래 조건을 유지합니다.

- `/opt/gshsapp/backup`가 쓰기 가능
- `/opt/gshsapp/data/dev.db`가 라이브 SQLite 파일
- `1235` 포트를 임시 restore drill 컨테이너에 사용할 수 있음
- restore drill은 라이브 DB를 직접 덮어쓰지 않음

## 11. 운영 VM 추가 준비 사항

운영 VM에서는 아래도 함께 준비합니다.

- `gshs-prod` label의 self-hosted runner
- 오프호스트 백업 대상 또는 Proxmox 스냅샷 절차
- `/opt/gshsapp/offsite-backup.sh` 반영 가능 상태
- 운영 도메인 `gshs.app`용 프록시 연결
- `PRODUCTION_MONITOR_ENABLED`를 켤 준비가 된 GitHub 변수 상태

## 12. 다음 단계

서버 자체 준비가 끝나면 아래 문서로 이어갑니다.

- [docs/cicd-setup.md](./cicd-setup.md)
- [deploy/README.md](../deploy/README.md)
- [docs/production-launch-runbook.md](./production-launch-runbook.md)
