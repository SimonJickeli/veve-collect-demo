#!/usr/bin/env python3
"""Tiny no-cache static server for the VeVe Collect app (dev only).
Serves the app/ directory and sends Cache-Control: no-store so edits to
HTML/JS/CSS always reflect on reload (avoids stale-bundle confusion)."""
import functools
import http.server
import os

PORT = int(os.environ.get("PORT", "4178"))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=DIRECTORY)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"no-cache dev server on http://127.0.0.1:{PORT} serving {DIRECTORY}")
        httpd.serve_forever()
