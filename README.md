# 주식봇 국내 주식 대시보드

국내 주식 수급, ETF 자금흐름, 52주 신고가·등락률을 조회하는 정적 대시보드와 Cloudflare Worker API입니다. 주문·계좌·자동매매 기능은 포함하지 않습니다.

## 구조

- `dashboard/`: GitHub Pages에 배포하는 정적 다섯 화면
- `worker/`: R2 데이터를 제공하고 공개 시세를 프록시하는 Cloudflare Worker
- `automation/`: KIS를 서버/CI에서만 호출해 데이터를 갱신하는 Node 수집기

## 로컬 확인

```bash
cp .env.example .env
npm test
python3 -m http.server 8080 --directory dashboard
```

브라우저에서 `http://localhost:8080`을 엽니다. 정적 fallback은 `dashboard/data.js`이며, Worker가 연결되지 않은 상태에서도 빈 상태 화면이 정상 표시됩니다.

## 보안

- `.env`, Cloudflare secret, GitHub Actions secret에만 비밀값을 넣습니다.
- `KIS_APP_KEY`, `KIS_APP_SECRET`, `DASHBOARD_SYNC_TOKEN`은 코드·HTML·Git 이력에 넣지 않습니다.
- KIS는 데이터 수집기에만 사용하고 브라우저는 Worker API만 호출합니다.

## 배포 순서

1. Cloudflare Worker에 R2 binding `DASHBOARD_BUCKET`을 연결합니다.
2. Worker secret `DASHBOARD_SYNC_TOKEN`과 public variable `PUBLIC_DASHBOARD_ORIGIN`을 설정합니다.
3. GitHub repository secrets에 KIS와 Worker 주소/동기화 토큰을 설정합니다.
4. GitHub Pages를 GitHub Actions 배포로 활성화합니다.
5. `refresh-domestic.yml`을 수동 실행해 첫 데이터를 업로드합니다.

자세한 클릭 순서는 프로젝트를 배포할 때 안내합니다.
