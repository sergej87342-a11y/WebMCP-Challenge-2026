#!/usr/bin/env python3
"""Dependency-free local server for the stage-0 WebMCP demo."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from os import PathLike
from pathlib import Path
from urllib.parse import urlsplit

PROJECT_ROOT = Path(__file__).resolve().parent
PUBLIC_ROOT = PROJECT_ROOT / "public"


class WebMCPDemoHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        if urlsplit(self.path).path == "/_headers":
            self.send_error(404, "Deployment configuration is not served locally")
            return None
        return super().send_head()

    def list_directory(self, path: str | PathLike[str]):
        self.send_error(404, "Directory listing is disabled")
        return None

    def end_headers(self) -> None:
        self.send_header("Origin-Agent-Cluster", "?1")
        self.send_header("Permissions-Policy", "tools=(self)")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve only the local WebMCP public demo assets.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8080, type=int)
    args = parser.parse_args()

    handler = partial(WebMCPDemoHandler, directory=str(PUBLIC_ROOT))
    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"Serving {PUBLIC_ROOT} at http://{args.host}:{args.port}/")
        server.serve_forever()


if __name__ == "__main__":
    main()
