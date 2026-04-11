#!/usr/bin/env python3
"""Get a Chrome Web Store API refresh token via OAuth2 loopback flow."""

import http.server
import json
import sys
import urllib.parse
import urllib.request
import webbrowser

PORT = 8844
CLIENT_ID = sys.argv[1] if len(sys.argv) > 1 else None
CLIENT_SECRET = sys.argv[2] if len(sys.argv) > 2 else None

if not CLIENT_ID or not CLIENT_SECRET:
    print("Usage: cws-get-token.py <client_id> <client_secret>")
    sys.exit(1)

REDIRECT_URI = f"http://127.0.0.1:{PORT}"
AUTH_URL = (
    "https://accounts.google.com/o/oauth2/auth"
    f"?response_type=code"
    f"&scope=https://www.googleapis.com/auth/chromewebstore"
    f"&client_id={CLIENT_ID}"
    f"&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
    f"&access_type=offline"
    f"&prompt=consent"
)

auth_code = None

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        auth_code = params.get("code", [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        if auth_code:
            self.wfile.write(b"<h2>Authorization successful! You can close this tab.</h2>")
        else:
            error = params.get("error", ["unknown"])[0]
            self.wfile.write(f"<h2>Error: {error}</h2>".encode())

    def log_message(self, *args):
        pass  # suppress request logs

print(f"Opening browser for authorization...")
webbrowser.open(AUTH_URL)

server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
server.handle_request()  # handle exactly one request

if not auth_code:
    print("Failed to get authorization code.")
    sys.exit(1)

print("Got authorization code, exchanging for refresh token...")

data = urllib.parse.urlencode({
    "code": auth_code,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "redirect_uri": REDIRECT_URI,
    "grant_type": "authorization_code",
}).encode()

req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
with urllib.request.urlopen(req) as resp:
    tokens = json.loads(resp.read())

refresh_token = tokens.get("refresh_token")
if refresh_token:
    print(f"\nCWS_REFRESH_TOKEN={refresh_token}\n")
else:
    print("No refresh_token in response:")
    print(json.dumps(tokens, indent=2))
    sys.exit(1)
