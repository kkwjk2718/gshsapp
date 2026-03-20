# 서버 준비 가이드

이 문서는 새 Ubuntu VM을 테스트 서버 또는 운영 서버로 준비할 때 사용하는 기준 문서입니다.

대상:

- Proxmox 위에 새 Ubuntu VM을 올린 직후
- Docker, 배포 사용자, 배포 경로가 아직 준비되지 않은 상태

## 목표 상태

서버가 아래 조건을 만족하면 준비 완료입니다.

- Docker Engine 설치 완료
- Docker Compose plugin 설치 완료
- 전용 배포 사용자 생성 완료
- `/opt/gshsapp` 디렉터리 준비 완료
- `.env`, `data/`, `backup/` 구조 준비 완료
- GitHub Actions self-hosted runner가 online 상태
- 리버스 프록시가 `127.0.0.1:1234`를 바라볼 수 있음

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

## 3. 배포 사용자 생성

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

이후 서버 안의 self-hosted runner가 `compose.yml`, `deploy.sh`를 반영합니다.

## 5. 서버 .env 작성

`/opt/gshsapp/.env` 파일을 직접 만듭니다.

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

주의:

- `.env`는 절대 저장소에 커밋하지 않습니다.
- 테스트와 운영 도메인을 섞지 않습니다.

## 6. 방화벽 및 네트워크

권장 정책:

- SSH 포트만 외부 허용
- 앱 포트 `1234`는 외부 공개보다 리버스 프록시 내부 접근을 우선

기본 예시:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

만약 리버스 프록시를 같은 서버에서 돌리면, 앱 컨테이너는 `127.0.0.1:1234`만 열어도 충분합니다.

## 7. 리버스 프록시 전제

현재 배포 자산은 앱 컨테이너가 직접 TLS를 처리하지 않는 구조입니다.

즉, 아래 구성 중 하나를 가정합니다.

- Nginx
- Caddy
- Traefik
- 클라우드 로드밸런서 + 내부 프록시

프록시는 `127.0.0.1:1234`를 upstream으로 바라보면 됩니다.

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

- [ ] 서버 IP 확보
- [ ] 배포 사용자명 확정
- [ ] `/opt/gshsapp/.env` 작성
- [ ] Docker 실행 가능 확인
- [ ] `deploy` 사용자가 `docker ps` 가능한지 확인
- [ ] self-hosted runner 등록 토큰 준비
- [ ] runner label 확정: 테스트=`gshs-test`, 운영=`gshs-prod`
- [ ] runner 서비스 online 확인

## 10. 다음 단계

서버 자체 준비가 끝나면 아래 문서로 넘어갑니다.

- [docs/cicd-setup.md](./cicd-setup.md)
- [deploy/README.md](../deploy/README.md)
