# 주식봇 설치·배포 순서

이 문서는 개발 경험이 없어도 이 프로젝트를 배포하도록 돕는 체크리스트입니다. 비밀번호·인증번호·API key·토큰은 이 문서나 채팅에 적지 않습니다.

## 이미 완료한 항목

- GitHub repository: `hanyabyab1212-ai/stockbot-domestic-dashboard`
- Cloudflare R2 bucket: `stockbot-domestic-data-hanyabyab1212`
- Cloudflare Worker: `stockbot-domestic-api`
- Worker R2 binding: `DASHBOARD_BUCKET`

## 1. KIS Open API 신청

1. [KIS Developers](https://apiportal.koreainvestment.com/intro)에 접속합니다.
2. `API신청`을 누르고 한국투자증권 계정으로 로그인합니다.
3. Open API 이용 신청을 완료한 뒤, 실전용 `App Key`와 `App Secret`을 발급받습니다.
4. 두 값은 비밀값입니다. 비밀번호 관리 도구에만 저장하고 채팅·메일·GitHub 파일에 넣지 않습니다.

한국투자증권 계정이 없다면 먼저 한국투자 앱이나 한국투자증권 홈페이지에서 본인 명의의 증권계좌를 만듭니다. 이 대시보드는 조회 전용이며 주문 권한을 사용하지 않습니다.

## 2. 프로젝트를 GitHub에 올리기

이 폴더는 이미 Git repository와 GitHub remote를 갖고 있습니다. 가장 쉬운 방법은 GitHub Desktop입니다.

1. [GitHub Desktop](https://desktop.github.com/)을 설치하고 GitHub 계정으로 로그인합니다.
2. `File` → `Add Local Repository`를 누릅니다.
3. 이 프로젝트 폴더를 선택합니다.
4. 상단의 `Push origin`을 누릅니다.

## 3. GitHub Secrets

repository의 `Settings` → `Secrets and variables` → `Actions` → `New repository secret`에서 아래 값을 등록합니다.

| Secret | 넣을 값 |
|---|---|
| `KIS_APP_KEY` | KIS 실전 App Key |
| `KIS_APP_SECRET` | KIS 실전 App Secret |
| `DASHBOARD_SYNC_TOKEN` | 임의의 긴 랜덤 문자열 |
| `DASHBOARD_API_URL` | `https://stockbot-domestic-api.hanyabyab1212.workers.dev` |
| `PUBLIC_DASHBOARD_URL` | GitHub Pages 최종 URL |
| `CLOUDFLARE_API_TOKEN` | Worker/R2 수정 권한만 가진 Cloudflare API token |
| `BOK_ECOS_API_KEY` | 한국은행 ECOS Open API 인증키 (원/달러·한국 국고채 10년·FX 스왑 추정용) |
| `EIA_API_KEY` | 미국 EIA Open Data API 키 (WTI 원유용) |

`KRX_OPEN_API_KEY`는 KRX 키를 별도로 쓰게 될 때만 등록합니다.

### 무료 거시지표 키 발급

1. [한국은행 ECOS Open API](https://ecos.bok.or.kr/api/)에서 회원가입 후 인증키를 발급받아 `BOK_ECOS_API_KEY`로 저장합니다.
2. [EIA Open Data](https://www.eia.gov/opendata/)에서 무료 API 키를 신청합니다. 키는 등록한 이메일로 오며, `EIA_API_KEY`라는 이름으로 저장합니다.
3. 키 자체는 채팅·화면 캡처·코드 파일에 넣지 않습니다. GitHub Secrets에만 붙여넣습니다.

수집 후 홈 화면에는 원/달러, 한국·미국 10년물, WTI 현물가와 USD/KRW 3개월 **금리차 추정 스왑포인트**가 표시됩니다. 스왑포인트는 CD 91일·미국 국채 3개월물로 계산한 참고치이며, 금융기관의 실제 호가가 아닙니다.

## 4. GitHub Pages

repository `Settings` → `Pages` → `Build and deployment`에서 `Source`를 `GitHub Actions`로 선택합니다. `Actions` 탭의 `Deploy dashboard to GitHub Pages`가 끝나면 공개 URL이 표시됩니다.

## 5. 첫 데이터 수집

repository `Actions` → `Refresh domestic dashboard` → `Run workflow`에서 `close`를 선택해 실행합니다. 1,000개 미만의 마감 행은 안전하게 저장 거부되며, 실패 시 기존 정상 데이터가 유지됩니다.
