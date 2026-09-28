#!/usr/bin/env python3
"""Local Mission Control publisher. Bind to localhost only. Tokens stay in publisher/tokens.json."""

import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
TOKENS = ROOT / "tokens.json"
ENV_FILE = ROOT / "local.env"
HOST = "127.0.0.1"
PORT = 8787
BSKY = "https://bsky.social/xrpc/"


def load_env():
    if not ENV_FILE.is_file():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def read_tokens():
    if not TOKENS.is_file():
        return {}
    return json.loads(TOKENS.read_text())


def write_tokens(data):
    TOKENS.write_text(json.dumps(data, indent=2) + "\n")
    os.chmod(TOKENS, 0o600)


def bsky_call(method, payload, jwt=None):
    headers = {"Content-Type": "application/json"}
    if jwt:
        headers["Authorization"] = "Bearer " + jwt
    request = Request(
        BSKY + method,
        data=json.dumps(payload).encode(),
        headers=headers,
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode())
    except HTTPError as error:
        body = error.read().decode(errors="replace")
        try:
            message = json.loads(body).get("message") or body
        except json.JSONDecodeError:
            message = body or error.reason
        raise RuntimeError(message) from error
    except URLError as error:
        raise RuntimeError(str(error.reason)) from error


def connect_bluesky(identifier, app_password):
    session = bsky_call(
        "com.atproto.server.createSession",
        {"identifier": identifier, "password": app_password},
    )
    tokens = read_tokens()
    tokens["bluesky"] = {
        "did": session["did"],
        "handle": session["handle"],
        "accessJwt": session["accessJwt"],
        "refreshJwt": session["refreshJwt"],
    }
    write_tokens(tokens)
    return session["handle"]


def post_bluesky(text):
    tokens = read_tokens().get("bluesky")
    if not tokens:
        raise RuntimeError("Bluesky is not connected.")
    record = {
        "$type": "app.bsky.feed.post",
        "text": text[:300],
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    created = bsky_call(
        "com.atproto.repo.createRecord",
        {"repo": tokens["did"], "collection": "app.bsky.feed.post", "record": record},
        jwt=tokens["accessJwt"],
    )
    return created.get("uri", "posted")


def build_message(text, link):
    body = str(text or "").strip()
    url = str(link or "").strip()
    if body and url:
        return body + "\n\n" + url
    return body or url


def status():
    tokens = read_tokens()
    bluesky = tokens.get("bluesky") or {}
    return {
        "bluesky": {
            "connected": bool(bluesky.get("accessJwt")),
            "handle": bluesky.get("handle", ""),
        },
        "needsDeveloperApp": [
            "X",
            "Facebook",
            "Instagram",
            "LinkedIn",
            "YouTube",
        ],
        "noPostApi": ["Substack", "SoundCloud"],
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[mission-control] " + (fmt % args))

    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode() or "{}")

    def do_GET(self):
        if self.path == "/api/status":
            self.send_json(200, status())
            return
        path = "/index.html" if self.path in ("/", "") else self.path.split("?", 1)[0]
        file_path = (ROOT / path.lstrip("/")).resolve()
        if not str(file_path).startswith(str(ROOT)) or not file_path.is_file():
            self.send_error(404)
            return
        kind = "text/html" if file_path.suffix == ".html" else "text/javascript"
        if file_path.suffix == ".css":
            kind = "text/css"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        try:
            payload = self.read_json()
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Send JSON."})
            return
        if self.path == "/api/bluesky/connect":
            identifier = str(payload.get("identifier") or os.environ.get("BLUESKY_IDENTIFIER") or "").strip()
            password = str(payload.get("appPassword") or "")
            if not identifier or not password:
                self.send_json(400, {"error": "Handle and Bluesky app password are required."})
                return
            try:
                handle = connect_bluesky(identifier, password)
            except RuntimeError as error:
                self.send_json(401, {"error": str(error)})
                return
            self.send_json(200, {"connected": True, "handle": handle})
            return
        if self.path == "/api/publish":
            message = build_message(payload.get("text", ""), payload.get("link", ""))
            if not message:
                self.send_json(400, {"error": "Write a post or a link."})
                return
            results = []
            if "bluesky" in set(payload.get("accounts") or []):
                try:
                    uri = post_bluesky(message)
                    results.append({"id": "bluesky", "ok": True, "detail": uri})
                except RuntimeError as error:
                    results.append({"id": "bluesky", "ok": False, "detail": str(error)})
            self.send_json(200, {"results": results})
            return
        self.send_json(404, {"error": "Not found."})


def main():
    load_env()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Mission Control at http://{HOST}:{PORT}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
