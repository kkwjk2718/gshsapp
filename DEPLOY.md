# GSHS.app 배포 가이드 (Docker)

이 문서는 GSHS.app을 Docker를 사용하여 배포하는 방법을 설명합니다.

## 1. 사전 요구사항

### 로컬 환경 (이미지 빌드용)
- **Docker Desktop**이 설치되고 실행 중이어야 합니다.
- 터미널에서 `docker -v`를 입력했을 때 버전 정보가 나와야 합니다.

### 서버 환경 (배포용)
- Docker가 설치되어 있어야 합니다.
- `docker-compose` 명령어를 사용할 수 있어야 합니다.

---

## 2. 도커 이미지 빌드하기

터미널(PowerShell 또는 CMD)을 열고 프로젝트 루트 경로에서 아래 명령어를 실행하세요.

```bash
docker build -t gshsapp:latest .
```

빌드가 완료되면 이미지가 생성됩니다. 확인하려면:
```bash
docker images
```

## 3. 이미지 서버로 옮기기 (방법 A: 파일로 저장)

레지스트리(Docker Hub 등)를 사용하지 않고 파일로 직접 옮기는 방법입니다.

1.  **이미지 파일 저** (로컬)
    ```bash
    docker save -o gshsapp.tar gshsapp:latest
    ```
2.  **파일 전송** (로컬 -> 서버)
    `gshsapp.tar` 파일을 서버로 전송합니다 (SCP, FTP 등 사용).
3.  **이미지 로드** (서버)
    ```bash
    docker load -i gshsapp.tar
    ```

## 4. 서버에서 실행하기

서버에 다음 파일들이 준비되어 있어야 합니다:
- `docker-compose.yml` (프로젝트에 포함됨)
- `.env` (환경변수 설정 파일, 직접 생성 필요)
- `data/` (데이터베이스 저장 폴더, 자동 생성됨)

### 실행 명령어
```bash
# 백그라운드에서 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

## 5. 자주 묻는 질문

**Q: DB 데이터는 어디에 저장되나요?**
A: 반드시 `DATABASE_URL=file:/app/data/dev.db` 로 설정하고, `./data:/app/data` 볼륨을 사용하세요. 이렇게 해야 `./data/dev.db`(SQLite)에 영구 저장됩니다. 컨테이너를 삭제/재생성해도 이 파일이 남아있으면 데이터는 유지됩니다.

> ⚠️ `file:/app/prisma/dev.db` 를 사용하면 DB가 컨테이너 내부에 저장되어, 재생성(`docker compose up --force-recreate`) 시 데이터가 초기화될 수 있습니다.

**Q: 수정사항을 배포하려면?**
A: 코드를 수정한 후 **2번(빌드)** 부터 다시 수행하여 이미지를 업데이트하고, 서버에서 `docker-compose up -d`를 다시 실행하면 됩니다.
