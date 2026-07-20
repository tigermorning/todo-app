"""구글 캘린더 연동을 위한 최초 1회 설정 스크립트.

이 스크립트는 반드시 본인이 직접 실행해야 합니다 (AI가 대신 로그인할 수 없습니다).
실행하면 브라우저가 열리고 구글 로그인 + 동의 화면이 나옵니다.
동의하면 token.json이 생성되고, 그 이후로는 앱이 자동으로 이 토큰을 사용합니다.

사전 준비: Google Cloud Console에서 만든 OAuth 클라이언트(데스크톱 앱) credentials.json이
이 폴더에 있어야 합니다. 준비 방법은 PRD.md 또는 채팅 안내를 참고하세요.
"""

import os

from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow

from calendar_sync import SCOPES

load_dotenv()


def main():
    credentials_file = os.environ.get("GOOGLE_CREDENTIALS_FILE", "credentials.json")
    token_file = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")

    if not os.path.exists(credentials_file):
        print(f"'{credentials_file}' 파일을 찾을 수 없습니다.")
        print("Google Cloud Console에서 OAuth 클라이언트(데스크톱 앱)를 만들고")
        print(f"다운로드한 JSON 파일을 '{credentials_file}' 이름으로 이 폴더에 두세요.")
        return

    flow = InstalledAppFlow.from_client_secrets_file(credentials_file, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(token_file, "w") as f:
        f.write(creds.to_json())

    print(f"연결 완료! '{token_file}'에 저장되었습니다.")


if __name__ == "__main__":
    main()
