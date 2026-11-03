"""
title: Kiwix Local Archive Search (Anti-Hallucination Gate)
author: Offline Resilience Knowledge Vault Architecture
version: 1.0.0
license: MIT
description: Queries the local Kiwix ZIM repository (kiwix-serve) and enforces a strict code-level refusal gate when documentation is not found locally.
"""

import html
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Dict, List, Optional


# Mandatory refusal gate string required by the specification
REFUSAL_MESSAGE = "STATUS_DOCUMENT_INEXISTENT: Subiectul nu se află în arhivele locale."


class _KiwixSearchHTMLParser(HTMLParser):
    """Parses the HTML search results page returned by kiwix-serve (/search?pattern=...)."""

    def __init__(self) -> None:
        super().__init__()
        self.results: List[Dict[str, str]] = []
        self._in_results_list = False
        self._in_li = False
        self._in_a = False
        self._in_cite = False
        self._current_item: Dict[str, str] = {}
        self._text_buf: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple]) -> None:
        attr_map = dict(attrs)
        if tag == "div" and "results" in attr_map.get("class", ""):
            self._in_results_list = True
        elif self._in_results_list and tag == "li":
            self._in_li = True
            self._current_item = {"href": "", "title": "", "snippet": "", "source": ""}
            self._text_buf = []
        elif self._in_li and tag == "a" and not self._current_item.get("href"):
            href = attr_map.get("href", "")
            if href and not href.startswith("javascript:"):
                self._in_a = True
                self._current_item["href"] = href
        elif self._in_li and tag == "cite":
            self._in_cite = True

    def handle_endtag(self, tag: str) -> None:
        if self._in_a and tag == "a":
            self._in_a = False
        elif self._in_cite and tag == "cite":
            self._in_cite = False
        elif self._in_li and tag == "li":
            self._in_li = False
            snippet = " ".join("".join(self._text_buf).split()).strip()
            self._current_item["snippet"] = snippet
            if self._current_item.get("href") and self._current_item.get("title"):
                self.results.append(self._current_item)
            self._current_item = {}
            self._text_buf = []
        elif self._in_results_list and tag == "div":
            self._in_results_list = False

    def handle_data(self, data: str) -> None:
        if not self._in_li:
            return
        if self._in_a:
            self._current_item["title"] += data
        elif self._in_cite:
            self._current_item["source"] += data
        else:
            self._text_buf.append(data)


class _ArticleTextExtractor(HTMLParser):
    """Extracts clean readable text (including tables and code blocks) from a ZIM article."""

    SKIP_TAGS = {"script", "style", "nav", "footer", "noscript", "svg"}

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.chunks: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple]) -> None:
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
        elif self._skip_depth == 0 and tag in {"p", "br", "tr", "li", "h1", "h2", "h3", "h4", "pre", "code"}:
            self.chunks.append("\n")
        elif self._skip_depth == 0 and tag in {"td", "th"}:
            self.chunks.append(" | ")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self.chunks.append(data)

    def get_text(self) -> str:
        raw = "".join(self.chunks)
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in raw.splitlines()]
        cleaned = "\n".join(line for line in lines if line)
        return cleaned


class Tools:
    def __init__(self) -> None:
        self.kiwix_base_url = os.environ.get("KIWIX_BASE_URL", "http://kiwix-serve:8080").rstrip("/")
        self.timeout_seconds = 8
        self.max_articles = 3
        self.max_article_chars = 3500

    def _fetch_url(self, url: str) -> Optional[str]:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "KnowledgeVault-ElenaVancea/1.0 (AirGapped; KiwixTool)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as response:
                if response.status != 200:
                    return None
                raw_bytes = response.read()
                if not raw_bytes:
                    return None
                return raw_bytes.decode("utf-8", errors="replace")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
            return None

    def _extract_archive_id(self, href: str) -> str:
        cleaned = href.strip("/")
        parts = cleaned.split("/")
        if len(parts) >= 2 and parts[0] == "content":
            return parts[1]
        if parts:
            return parts[0]
        return "local-zim-archive"

    def search_archive(self, query: str) -> str:
        """
        Searches the local Kiwix ZIM archive repository (Wikipedia, syscall.sh, Felix Cloutier x86, OSDev, DevDocs, StackOverflow, iFixit, WikiMed).
        Returns verified documentary excerpts or STATUS_DOCUMENT_INEXISTENT if the topic does not exist in the local archives.

        :param query: Technical term, assembly mnemonic, system call, or scientific concept to search for.
        :return: Verified documentary content from the local ZIM archive or the mandatory refusal status string.
        """
        if not query or not query.strip():
            return REFUSAL_MESSAGE

        normalized_query = query.strip()
        encoded_query = urllib.parse.quote_plus(normalized_query)
        search_url = f"{self.kiwix_base_url}/search?pattern={encoded_query}&pageLength=5"

        html_body = self._fetch_url(search_url)
        if not html_body:
            return REFUSAL_MESSAGE

        lower_body = html_body.lower()
        if "no results were found" in lower_body or "0 results" in lower_body:
            return REFUSAL_MESSAGE

        parser = _KiwixSearchHTMLParser()
        parser.feed(html_body)
        results = parser.results

        # Fallback regex parser in case kiwix-serve uses slightly different HTML markup across versions
        if not results:
            pattern = re.compile(
                r'<a[^>]+href=["\'](?P<href>/(?:content/)?[^"\'>\s]+)["\'][^>]*>(?P<title>.*?)</a>',
                re.IGNORECASE | re.DOTALL,
            )
            for match in pattern.finditer(html_body):
                href = match.group("href")
                if any(
                    href.startswith(prefix)
                    for prefix in ("/search", "/skin", "/catalog", "/viewer", "/catch", "javascript:")
                ):
                    continue
                title_clean = re.sub(r"<[^>]+>", "", match.group("title")).strip()
                if title_clean:
                    results.append(
                        {
                            "href": href,
                            "title": html.unescape(title_clean),
                            "snippet": "",
                            "source": self._extract_archive_id(href),
                        }
                    )

        if not results:
            return REFUSAL_MESSAGE

        report_sections: List[str] = [
            f"=== VERIFIED RESULTS FROM LOCAL ZIM ARCHIVE (Query: '{normalized_query}') ==="
        ]

        for idx, item in enumerate(results[: self.max_articles], start=1):
            href = item["href"]
            title = item["title"].strip()
            archive_id = item.get("source") or self._extract_archive_id(href)
            snippet = item.get("snippet", "").strip()

            article_url = f"{self.kiwix_base_url}{href}" if href.startswith("/") else f"{self.kiwix_base_url}/{href}"
            article_html = self._fetch_url(article_url)
            article_text = ""
            if article_html:
                extractor = _ArticleTextExtractor()
                extractor.feed(article_html)
                article_text = extractor.get_text()[: self.max_article_chars]

            section = [
                f"\n--- DOCUMENTARY RECORD #{idx} ---",
                f"Document Title: {title}",
                f"Archive Source / ZIM ID: [{archive_id} -> {href}]",
            ]
            if snippet:
                section.append(f"Index Summary: {snippet}")
            if article_text:
                section.append(f"Extracted Archive Content:\n{article_text}")

            report_sections.append("\n".join(section))

        return "\n\n".join(report_sections)
