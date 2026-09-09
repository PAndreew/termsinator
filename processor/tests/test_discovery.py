import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from termsinator_processor.discovery import Discoverer


class Site(BaseHTTPRequestHandler):
    pages = {
        "/": """<html><body><main>Product</main><footer>
        <a href='/privacy'>Privacy Policy</a><a href='/privacy-alias'>Privacy Notice</a>
        <a href='/terms'>Terms of Service</a><a href='/calendar?day=1'>Calendar</a></footer></body></html>""",
        "/privacy": "<html><main><h1>Privacy</h1><p>We collect account data to provide the service. We describe retention, sharing, security, deletion, access, and user choices in this privacy policy.</p></main></html>",
        "/terms": "<html><main><h1>Terms</h1><p>These terms govern use of the service, account termination, payments, liability, disputes, content ownership, acceptable conduct, and changes to this agreement.</p></main></html>",
        "/robots.txt": "User-agent: *\nDisallow: /calendar\n",
    }

    def do_GET(self):
        if self.path == "/privacy-alias":
            self.send_response(302)
            self.send_header("Location", "/privacy")
            self.end_headers()
            return
        body = self.pages.get(self.path)
        if body is None:
            self.send_response(404); self.end_headers(); return
        self.send_response(200)
        self.send_header("Content-Type", "text/plain" if self.path.endswith(".txt") else "text/html")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *_):
        pass


class DiscoveryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Site)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_finds_legal_pages_without_crawling_unrelated_tree(self):
        root = f"http://127.0.0.1:{self.server.server_port}/"
        result = Discoverer(allow_private=True, allowed_ports={self.server.server_port}).discover(root)
        urls = {document.url for document in result.documents}
        self.assertEqual(urls, {root + "privacy", root + "terms"})
        self.assertEqual({document.kind for document in result.documents}, {"privacy", "terms"})
        self.assertLessEqual(result.pages_visited, 5)
        self.assertTrue(result.robots_respected)


if __name__ == "__main__":
    unittest.main()
