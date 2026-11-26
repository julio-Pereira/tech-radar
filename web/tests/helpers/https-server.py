"""Static HTTPS server for the WebKit project (playwright.config.js).

WebKit applies the CSP's upgrade-insecure-requests to loopback too, so over
plain http every subresource is rewritten to https and the app never loads.
Chromium and Firefox exempt loopback. Production is HTTPS (GitHub Pages), so
the WebKit run gets HTTPS as well, with a throwaway self-signed certificate
made at start and trusted through ignoreHTTPSErrors. Dev-only, never shipped.

Usage: python3 tests/helpers/https-server.py PORT   (serves the current dir)
"""
import http.server
import os
import ssl
import subprocess
import sys
import tempfile

port = int(sys.argv[1])
tmp = tempfile.mkdtemp(prefix="tr-https-")
cert, key = os.path.join(tmp, "cert.pem"), os.path.join(tmp, "key.pem")
subprocess.run(
    ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
     "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
     "-keyout", key, "-out", cert],
    check=True, capture_output=True,
)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert, key)
server = http.server.ThreadingHTTPServer(("127.0.0.1", port), http.server.SimpleHTTPRequestHandler)
server.socket = ctx.wrap_socket(server.socket, server_side=True)
server.serve_forever()
