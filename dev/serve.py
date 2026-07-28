#!/usr/bin/env python3
"""Dev server: http.server with caching disabled, so edits show up on a
plain reload instead of a hard refresh. Usage: serve.py [port] [directory]"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
    if len(sys.argv) > 2:
        os.chdir(sys.argv[2])
    print('serving %s on http://localhost:%d (no-cache)' % (os.getcwd(), port))
    http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
