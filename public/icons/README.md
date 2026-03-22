# PWA 아이콘 안내

이 프로젝트의 PWA는 여러 크기의 아이콘을 필요로 합니다. 현재는 학교 마크 원본 PNG를 기준으로 아이콘을 생성합니다.

## 필요한 아이콘 크기

- 72x72
- 96x96
- 128x128
- 144x144
- 152x152
- 192x192
- 384x384
- 512x512

## PNG 아이콘 생성 방법

SVG를 여러 크기의 PNG로 변환할 때는 아래 방법 중 하나를 사용할 수 있습니다.

### 방법 1: 온라인 도구 사용

1. `public/icons/icon-source.png`를 <https://realfavicongenerator.net/>에 업로드합니다.
2. 생성된 아이콘 묶음을 내려받습니다.
3. 파일을 `public/icons/`에 배치하고 `src/app/favicon.ico`도 같은 원본으로 교체합니다.

### 방법 2: `sharp` 사용

```bash
npm install sharp
node generate-icons.js
```

이 스크립트는 `public/icons/icon-source.png`를 기준으로 PWA PNG 아이콘과 `src/app/icon.png`, `src/app/apple-icon.png`를 생성합니다.

### 방법 3: 수동 교체

`icon-source.png`를 새 원본으로 교체한 뒤 PNG를 다시 생성합니다. 브라우저 탭 아이콘도 바꾸려면 `src/app/favicon.ico`를 같은 원본으로 함께 교체해야 합니다.

## 현재 아이콘 상태

현재 아이콘은 경남과학고등학교 학교 마크를 기준으로 생성됩니다.
