"""Servidor local que sirve la web y guarda los votos en votacion.json."""

import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
VOTES_FILE = "votacion.json"
_lock = threading.Lock()


def load_votes():
    if not os.path.exists(VOTES_FILE):
        return {}
    try:
        with open(VOTES_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    except (json.JSONDecodeError, OSError):
        return {}


def save_votes(data):
    with open(VOTES_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path.rstrip("/") != "/api/votacion":
            self.send_error(404, "No encontrado")
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self.send_error(400, "JSON invalido")
            return

        codigo = str(payload.get("codigo", "")).strip()
        categoria = str(payload.get("categoria", "")).strip()
        try:
            valor = int(payload.get("valor"))
        except (TypeError, ValueError):
            valor = 0
        try:
            anterior = int(payload.get("anterior"))
        except (TypeError, ValueError):
            anterior = 0

        if not codigo or not categoria or valor < 1 or valor > 5:
            self.send_error(400, "Datos de voto invalidos")
            return

        with _lock:
            data = load_votes()
            school = data.setdefault(codigo, {})
            agg = school.setdefault(categoria, {"sum": 0, "count": 0})
            if 1 <= anterior <= 5 and agg["count"] > 0:
                agg["sum"] += valor - anterior
            else:
                agg["sum"] += valor
                agg["count"] += 1
            agg["sum"] = max(agg["sum"], 0)
            save_votes(data)
            aggregate = data[codigo]

        body = json.dumps({"ok": True, "aggregate": aggregate}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if self.path.endswith("votacion.json"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("", PORT), Handler)
    print(f"Servidor con votacion en http://localhost:{PORT}/mapa-colegios-google-sites.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.shutdown()
