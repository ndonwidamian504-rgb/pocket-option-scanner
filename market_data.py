"""
Pocket Option Scanner - Market Data Bridge
Analysis only. No trading or account credentials.
"""

import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "127.0.0.1"
PORT = 8765

latest_data = {}


class MarketDataHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path == "/health":
            self.send_json({
                "status": "ok",
                "service": "Pocket Option Scanner"
            })
            return

        if self.path == "/candles":
            self.send_json(latest_data)
            return

        self.send_error(404)

    def do_POST(self):
        global latest_data

        if self.path != "/candles":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        try:
            data = json.loads(body.decode("utf-8"))

            latest_data = {
                "timestamp": time.time(),
                "data": data
            }

            self.send_json({
                "status": "received"
            })

        except Exception as error:
            self.send_json({
                "status": "error",
                "message": str(error)
            }, 400)

    def send_json(self, data, status=200):
        response = json.dumps(data).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json"
        )
        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )
        self.end_headers()

        self.wfile.write(response)

    def log_message(self, format, *args):
        return


def start_server():
    server = HTTPServer(
        (HOST, PORT),
        MarketDataHandler
    )

    print("Market-data bridge started.")
    print(f"Listening on http://{HOST}:{PORT}")
    print("Waiting for candle data...")
    print("Analysis only - no automatic trading.")

    server.serve_forever()


if __name__ == "__main__":
    start_server()
