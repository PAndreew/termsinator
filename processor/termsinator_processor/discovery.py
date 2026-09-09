from __future__ import annotations

import hashlib
import http.client
import ipaddress
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from html.parser import HTMLParser

KNOWN_POLICY_URLS = {
    "amazon.com": (
        ("https://www.amazon.com/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM", "Conditions of Use"),
        ("https://www.amazon.com/gp/help/customer/display.html?nodeId=GX7NJQ4ZB8MHFRNJ", "Privacy Notice"),
    ),
}

LEGAL_TERMS = {
    "privacy": ("privacy", "datenschutz", "confidentialite", "privacidad", "privacidade"),
    "terms": ("terms", "conditions", "tos", "bedingungen", "condiciones", "legal terms"),
    "cookies": ("cookie", "tracking technologies"),
    "acceptable_use": ("acceptable use", "aup", "usage policy"),
    "subscription": ("subscription", "billing", "refund", "cancellation"),
    "ai_data_use": ("ai policy", "model training", "data use", "generative ai"),
}


@dataclass
class Document:
    id: str
    kind: str
    title: str
    url: str
    text: str
    sha256: str
    retrieved_at: str
    media_type: str = "text/html"
    language: str = "en"
    relationship: str = "same_registrable_domain"


@dataclass
class DiscoveryResult:
    root_url: str
    final_root_url: str
    hostname: str
    documents: list[Document] = field(default_factory=list)
    candidate_urls: list[str] = field(default_factory=list)
    pages_visited: int = 0
    bytes_downloaded: int = 0
    robots_respected: bool = True
    truncated: bool = False
    root_text: str = ""


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.text: list[str] = []
        self.title: list[str] = []
        self._href: str | None = None
        self._anchor: list[str] = []
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "style", "svg", "noscript"}:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag == "a" and attrs.get("href"):
            self._href = attrs["href"]
            self._anchor = []

    def handle_endtag(self, tag):
        if tag in {"script", "style", "svg", "noscript"} and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._href:
            self.links.append((self._href, " ".join(self._anchor)))
            self._href = None
            self._anchor = []

    def handle_data(self, data):
        if self._skip:
            return
        clean = " ".join(data.split())
        if not clean:
            return
        self.text.append(clean)
        if self._in_title:
            self.title.append(clean)
        if self._href:
            self._anchor.append(clean)


class ValidatingRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, validator):
        super().__init__()
        self.validator = validator

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.validator(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Discoverer:
    def __init__(self, *, max_documents=8, max_total_bytes=8_000_000, timeout=12,
                 allow_private=False, allowed_ports={80, 443}):
        self.max_documents = max_documents
        self.max_total_bytes = max_total_bytes
        self.timeout = timeout
        self.allow_private = allow_private
        self.allowed_ports = set(allowed_ports)
        self.user_agent = "Mozilla/5.0 (compatible; Termsinator/0.1; +https://termsinator.46-62-240-211.sslip.io/methodology/)"

    def discover(self, raw_url: str) -> DiscoveryResult:
        root = self._normalize_root(raw_url)
        body, final, media_type = self._fetch(root)
        parser = self._parse_html(body)
        result = DiscoveryResult(
            root_url=root,
            final_root_url=final,
            hostname=urllib.parse.urlsplit(final).hostname or "",
            pages_visited=1,
            bytes_downloaded=len(body),
            root_text=self._normalized_text(parser.text)[:30_000],
        )
        robots_url = urllib.parse.urljoin(final, "/robots.txt")
        disallowed: list[str] = []
        try:
            robots, _, _ = self._fetch(robots_url, accept="text/plain")
            result.pages_visited += 1
            result.bytes_downloaded += len(robots)
            disallowed = self._robots_disallow(robots.decode(errors="replace"))
        except (OSError, ValueError, urllib.error.URLError):
            pass

        candidates: dict[str, tuple[int, str, str]] = {}
        for href, anchor in parser.links:
            self._add_candidate(candidates, final, href, anchor, priority=20)
        for path, label in (("/privacy", "Privacy Policy"), ("/privacy-policy", "Privacy Policy"),
                            ("/legal/privacy", "Privacy Policy"), ("/terms", "Terms of Service"),
                            ("/terms-of-service", "Terms of Service"), ("/legal/terms", "Terms of Service"),
                            ("/legal/privacy-policy/", "Privacy Policy"),
                            ("/legal/end-user-agreement/", "Terms of Service"),
                            ("/us/legal/privacy-policy/", "Privacy Policy"),
                            ("/us/legal/end-user-agreement/", "Terms of Service"),
                            ("/cookie-policy", "Cookie Policy"), ("/legal/cookies-policy/", "Cookie Policy")):
            self._add_candidate(candidates, final, path, label, priority=10)
            if urllib.parse.urlsplit(root).hostname != urllib.parse.urlsplit(final).hostname:
                self._add_candidate(candidates, root, path, label, priority=10)

        known_policies = KNOWN_POLICY_URLS.get(self._site_key(result.hostname), ())
        for known_url, label in known_policies:
            self._add_candidate(candidates, final, known_url, label, priority=30)
        preferred_urls = {known_url for known_url, _ in known_policies}

        for sitemap_url in self._sitemap_urls(final, disallowed):
            try:
                sitemap, sitemap_final, _ = self._fetch(sitemap_url, accept="application/xml,text/xml")
                result.pages_visited += 1
                result.bytes_downloaded += len(sitemap)
                for location in self._parse_sitemap(sitemap):
                    self._add_candidate(candidates, sitemap_final, location, "")
                if result.pages_visited >= 4:
                    break
            except (OSError, ValueError, urllib.error.URLError, ET.ParseError):
                continue

        ranked = sorted(candidates.items(), key=lambda item: (-item[1][0], item[0]))
        queue = list(ranked)
        queued = {url for url, _ in queue}
        fetched: set[str] = set()
        seen_hashes: set[str] = set()
        seen_final_urls: set[str] = set()
        root_parts = [part for part in urllib.parse.urlsplit(root).path.split("/") if part]
        desired_locale = root_parts[0].lower() if root_parts and re.fullmatch(r"[a-z]{2}(?:-[a-z]{2})?", root_parts[0].lower()) else None
        while queue:
            url, (_, kind, title_hint) = queue.pop(0)
            if url in fetched:
                continue
            fetched.add(url)
            if len(result.documents) >= self.max_documents:
                result.truncated = True
                break
            if self._is_disallowed(url, disallowed):
                continue
            try:
                page, page_final, page_type = self._fetch(url)
            except (OSError, ValueError, urllib.error.URLError):
                continue
            result.pages_visited += 1
            result.bytes_downloaded += len(page)
            if result.bytes_downloaded > self.max_total_bytes:
                result.truncated = True
                break
            if "html" not in page_type:
                continue
            parsed = self._parse_html(page)
            # Same-site legal landing pages often link to the actual policies. Do not
            # recursively follow links from external policy providers.
            page_host = (urllib.parse.urlsplit(page_final).hostname or "").removeprefix("www.")
            if page_host == result.hostname.removeprefix("www."):
                before = set(candidates)
                for href, anchor in parsed.links:
                    self._add_candidate(candidates, page_final, href, anchor, priority=-5)
                additions = [(candidate_url, candidates[candidate_url]) for candidate_url in set(candidates) - before
                             if candidate_url not in queued]
                additions.sort(key=lambda item: (-item[1][0], item[0]))
                queue.extend(additions)
                queued.update(url for url, _ in additions)
            final_parts = [part for part in urllib.parse.urlsplit(page_final).path.split("/") if part]
            final_locale = final_parts[0].lower() if final_parts and re.fullmatch(r"[a-z]{2}(?:-[a-z]{2})?", final_parts[0].lower()) else None
            text = self._normalized_text(parsed.text)
            if (desired_locale and final_locale and desired_locale != final_locale) or len(text) < 100 or not self._looks_legal(page_final, " ".join(parsed.title), text):
                continue
            digest = hashlib.sha256(text.encode()).hexdigest()
            canonical_final = urllib.parse.urlunsplit((*urllib.parse.urlsplit(page_final)[:4], ""))
            if digest in seen_hashes or canonical_final in seen_final_urls:
                continue
            seen_hashes.add(digest)
            seen_final_urls.add(canonical_final)
            result.documents.append(Document(
                id=f"doc-{len(result.documents) + 1}",
                kind=self._infer_kind(page_final, " ".join(parsed.title), text, kind),
                title=" ".join(parsed.title)[:300] or title_hint[:300] or kind.replace("_", " ").title(),
                url=page_final,
                text=text,
                sha256=digest,
                retrieved_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                media_type=page_type.split(";", 1)[0],
                relationship=("same_registrable_domain" if self._site_key(urllib.parse.urlsplit(page_final).hostname or "") == self._site_key(result.hostname) else "directly_linked_external_policy"),
            ))
            if preferred_urls and preferred_urls.issubset({document.url for document in result.documents}):
                break
        result.candidate_urls = list(dict.fromkeys([url for url, _ in ranked] + list(candidates)))[:50]
        return result

    def _normalize_root(self, raw_url):
        raw_url = raw_url.strip()
        if "://" not in raw_url:
            raw_url = "https://" + raw_url
        parsed = urllib.parse.urlsplit(raw_url)
        if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password or not parsed.hostname:
            raise ValueError("invalid public URL")
        self._validate_host(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
        return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path or "/", "", ""))

    def _validate_host(self, hostname, port):
        if port not in self.allowed_ports:
            raise ValueError("port not allowed")
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        if self.allow_private:
            return
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise ValueError("non-public destination")

    def _fetch(self, url, accept="text/html,application/xhtml+xml"):
        self._validate_destination(url)
        request = urllib.request.Request(url, headers={"User-Agent": self.user_agent, "Accept": accept,
                                                       "Accept-Language": "en-US,en;q=0.9"})
        opener = urllib.request.build_opener(ValidatingRedirectHandler(self._validate_destination))
        with opener.open(request, timeout=self.timeout) as response:
            final = response.geturl()
            final_parsed = urllib.parse.urlsplit(final)
            self._validate_host(final_parsed.hostname, final_parsed.port or (443 if final_parsed.scheme == "https" else 80))
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > self.max_total_bytes:
                raise ValueError("response too large")
            try:
                body = response.read(self.max_total_bytes + 1)
            except http.client.IncompleteRead as error:
                body = error.partial
            if len(body) > self.max_total_bytes:
                raise ValueError("response too large")
            return body, final, response.headers.get_content_type()

    def _validate_destination(self, url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password or not parsed.hostname:
            raise ValueError("invalid redirect destination")
        self._validate_host(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))

    def _parse_html(self, body):
        parser = PageParser()
        parser.feed(body.decode("utf-8", errors="replace"))
        return parser

    def _add_candidate(self, candidates, base, href, anchor, priority=0):
        try:
            url = urllib.parse.urljoin(base, href)
            parsed = urllib.parse.urlsplit(url)
            base_host = urllib.parse.urlsplit(base).hostname or ""
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                return
            semantic_query = urllib.parse.urlencode([
                (key, value) for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
                if key.lower() in {"nodeid", "documentid", "policyid", "locale", "language"}
            ])
            clean = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path, semantic_query, ""))
            haystack = (parsed.path + " " + parsed.query + " " + anchor).lower().replace("-", "_")
            score, kind = self._legal_score(haystack)
            if score <= 0:
                return
            score += priority
            if score <= 0:
                return
            same_host = parsed.hostname.lower().removeprefix("www.") == base_host.lower().removeprefix("www.")
            same_site = self._site_key(parsed.hostname) == self._site_key(base_host)
            if not same_site:
                return
            if any(part in parsed.path.lower() for part in ("/revision", "/archive", "/previous")):
                score -= 8
            if score <= 0:
                return
            previous = candidates.get(clean)
            if not previous or score > previous[0]:
                candidates[clean] = (score, kind, anchor.strip())
        except (ValueError, UnicodeError):
            return

    def _legal_score(self, text):
        best = (0, "other")
        for kind, terms in LEGAL_TERMS.items():
            score = sum(5 if re.search(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", text) else 0 for term in terms)
            if f"/{kind.replace('_', '-')}" in text or f"/{kind}" in text:
                score += 5
            if score > best[0]:
                best = (score, kind)
        return best

    def _site_key(self, hostname):
        parts = hostname.lower().rstrip(".").split(".")
        return ".".join(parts[-2:]) if len(parts) >= 2 else hostname

    def _infer_kind(self, url, title, text, fallback):
        score, kind = self._legal_score(urllib.parse.urlsplit(url).path.lower() + " " + title.lower())
        if score > 0:
            return kind
        opening = text[:3000].lower()
        phrases = (("privacy policy", "privacy"), ("privacy notice", "privacy"),
                   ("terms of use", "terms"), ("terms of service", "terms"),
                   ("terms and conditions", "terms"), ("cookie policy", "cookies"))
        return next((kind for phrase, kind in phrases if phrase in opening), fallback)

    def _looks_legal(self, url, title, text):
        path = urllib.parse.urlsplit(url).path.lower()
        if any(marker in path for marker in ("notfound", "not-found", "/404", "/error")):
            return False
        score, _ = self._legal_score(path + " " + title.lower())
        if score > 0:
            return True
        opening = text[:3000].lower()
        return any(phrase in opening for phrase in ("privacy policy", "privacy notice", "terms of use",
                                                      "terms of service", "terms and conditions", "cookie policy"))

    def _sitemap_urls(self, root, disallowed):
        return [urllib.parse.urljoin(root, "/sitemap.xml")]

    def _parse_sitemap(self, body):
        root = ET.fromstring(body)
        return [node.text.strip() for node in root.iter() if node.tag.endswith("loc") and node.text][:5000]

    def _robots_disallow(self, text):
        return [line.split(":", 1)[1].strip() for line in text.splitlines()
                if line.lower().startswith("disallow:") and line.split(":", 1)[1].strip()]

    def _is_disallowed(self, url, disallowed):
        path = urllib.parse.urlsplit(url).path
        return any(path.startswith(rule) for rule in disallowed if rule != "/")

    def _normalized_text(self, parts):
        return re.sub(r"\s+", " ", "\n".join(parts)).strip()
