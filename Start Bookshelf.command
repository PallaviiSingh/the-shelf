#!/bin/bash
# ============================================================
#  Pallavi's Bookshelf  ·  local launcher (no-cache)
#  Double-click this file to open the bookshelf on your laptop.
# ============================================================
cd "$(dirname "$0")"

PORT=8787
while lsof -i :"$PORT" >/dev/null 2>&1; do PORT=$((PORT+1)); done

echo ""
echo "  Pallavi's Bookshelf"
echo "  ---------------------------------------------"
echo "  Serving at:  http://localhost:$PORT"
echo ""

python3 - "$PORT" << 'PY' &
import sys, http.server, socketserver
port = int(sys.argv[1])
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, *a):
        pass
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(("127.0.0.1", port), H).serve_forever()
PY
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT

sleep 1
open "http://localhost:$PORT/index.html#/gallery"

echo "  The bookshelf just opened in your browser."
echo "  Keep this little window open while you read."
echo "  To stop it: close this window, or press Control-C."
echo ""
wait $SERVER_PID
