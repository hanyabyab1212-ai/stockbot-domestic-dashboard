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

`KRX_OPEN_API_KEY`는 KRX 키를 별도로 쓰게 될 때만 등록합니다.

## 4. GitHub Pages

repository `Settings` → `Pages` → `Build and deployment`에서 `Source`를 `GitHub Actions`로 선택합니다. `Actions` 탭의 `Deploy dashboard to GitHub Pages`가 끝나면 공개 URL이 표시됩니다.

## 5. 첫 데이터 수집

repository `Actions` → `Refresh domestic dashboard` → `Run workflow`에서 `close`를 선택해 실행합니다. 1,000개 미만의 마감 행은 안전하게 저장 거부되며, 실패 시 기존 정상 데이터가 유지됩니다.
