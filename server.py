import json, os, hmac, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import add_stage

PORT = 8765
TOKEN = os.environ["STAGE_TOKEN"]
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        if code != 204:
            self.wfile.write(body)

    def _authorized(self):
        return hmac.compare_digest(self.headers.get("X-Token", ""), TOKEN)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path != "/boards":
            return self._send(404, {"ok": False, "error": "not found"})
        if not self._authorized():
            return self._send(403, {"ok": False, "error": "token invalide"})
        try:
            self._send(200, {"ok": True, "boards": add_stage.list_boards(),
                             "defaultBoard": add_stage.BOARD_ID,
                             "defaultList": add_stage.LIST_NAME})
        except Exception as e:
            self._send(500, {"ok": False, "error": str(e)})

    def do_POST(self):
        if self.path != "/add":
            return self._send(404, {"ok": False, "error": "not found"})
        if not self._authorized():
            return self._send(403, {"ok": False, "error": "token invalide"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length))
            url = data["url"]
            if not url.startswith(("http://", "https://")):
                raise ValueError("URL invalide")
            with lock:  # une offre à la fois
                name, link = add_stage.main(url, data.get("html"),
                                            data.get("board"), data.get("list"))
            self._send(200, {"ok": True, "name": name, "card": link})
        except Exception as e:
            self._send(500, {"ok": False, "error": str(e)})


if __name__ == "__main__":
    print(f"Serveur sur http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
