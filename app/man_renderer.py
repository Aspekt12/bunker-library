"""
Structured Linux Man Page Renderer for BunkerOS XP.
Uses GNU `tbl` + `groff -mandoc -rHY=0 -Tutf8` (with ANSI SGR bold/underline codes)
and transforms the typeset output into a rich, interactive MSDN/XP Technical Manual
view with:
  - Sticky Section Jump Pills (NAME, SYNOPSIS, DESCRIPTION, RETURN VALUE, ERRORS, EXAMPLES, SEE ALSO)
  - Syntax-styled SYNOPSIS & EXAMPLES code blocks
  - Highlighted Option / Flag / Error Constant definition cards
  - Clickable cross-reference links (e.g. munmap(2), open(2), malloc(3))
"""

import gzip
import html
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List


SECTION_TITLES = {
    "1": "User Commands & Shell Utilities",
    "2": "Linux System Calls Manual",
    "3": "C & POSIX Library Functions",
    "4": "Special Files, /dev & Drivers",
    "5": "File Formats, /proc & /etc Configs",
    "6": "Games & Classic UNIX Demos",
    "7": "Kernel Internals, Protocols & Standards",
    "8": "System Administration & Daemons",
}


def resolve_raw_man_bytes(man_dir: Path, sec: str, filename: str) -> bytes:
    p = man_dir / f"man{sec}" / filename
    if not p.exists():
        return b""
    raw_bytes = gzip.open(p, "rb").read() if filename.endswith(".gz") else p.read_bytes()
    head = raw_bytes[:256].decode("utf-8", errors="replace").strip()
    m_so = re.match(r"^\.so\s+man([1-8])/([^\s]+)", head)
    if m_so:
        t_sec, t_name = m_so.group(1), m_so.group(2)
        for cand in (t_name, t_name + ".gz"):
            tp = man_dir / f"man{t_sec}" / cand
            if tp.exists():
                return gzip.open(tp, "rb").read() if cand.endswith(".gz") else tp.read_bytes()
    return raw_bytes


def sgr_line_to_html(line: str, link_xrefs: bool = True) -> str:
    """
    Convert a single line containing ANSI SGR sequences (\x1b[...m) or backspace
    overstrikes into safe, semantic HTML (<strong class="man-kw">, <var class="man-arg">),
    plus clickable cross-references like `munmap(2)`.
    """
    if "\x08" in line:
        line = re.sub(r"_\x08(.)", "\x1b[4m\\1\x1b[24m", line)
        line = re.sub(r"(.)\x08\1", "\x1b[1m\\1\x1b[22m", line)

    parts = re.split(r"(\x1b\[[0-9;]*m)", line)
    bold = False
    underline = False
    out: List[str] = []

    def close_tags() -> str:
        res = ""
        if underline:
            res += "</var>"
        if bold:
            res += "</strong>"
        return res

    def open_tags() -> str:
        res = ""
        if bold:
            res += '<strong class="man-kw">'
        if underline:
            res += '<var class="man-arg">'
        return res

    for token in parts:
        if token.startswith("\x1b[") and token.endswith("m"):
            codes_str = token[2:-1]
            codes = [int(c) if c.isdigit() else 0 for c in codes_str.split(";")] if codes_str else [0]
            out.append(close_tags())
            for c in codes:
                if c == 0:
                    bold = False
                    underline = False
                elif c == 1:
                    bold = True
                elif c == 4:
                    underline = True
                elif c == 22:
                    bold = False
                elif c == 24:
                    underline = False
            out.append(open_tags())
        else:
            if token:
                out.append(html.escape(token))

    out.append(close_tags())
    rendered = "".join(out)

    # Clean up empty or adjacent identical tags
    rendered = re.sub(r'<strong class="man-kw">\s*</strong>', "", rendered)
    rendered = re.sub(r'<var class="man-arg">\s*</var>', "", rendered)
    rendered = rendered.replace('</strong><strong class="man-kw">', "")
    rendered = rendered.replace('</var><var class="man-arg">', "")

    if link_xrefs:
        rendered = re.sub(
            r'(?:<strong class="man-kw">([a-zA-Z0-9_.:-]+)</strong>|(?<![a-zA-Z0-9_/-])([a-zA-Z0-9_.-]{2,}))\(([1-8])[a-zA-Z]*\)',
            lambda m: (
                f'<a href="javascript:void(0)" class="man-xref" '
                f'onclick="openManPage(\'{m.group(3)}\', \'{m.group(1) or m.group(2)}\')" '
                f'title="Open man {m.group(1) or m.group(2)}({m.group(3)})">'
                f'{m.group(1) or m.group(2)}({m.group(3)})</a>'
            ),
            rendered,
        )

    return rendered


def strip_sgr(text: str) -> str:
    s = re.sub(r"\x1b\[[0-9;]*m", "", text)
    s = re.sub(r".\x08", "", s)
    return s


def is_subheading_line(ln: str) -> bool:
    plain = strip_sgr(ln)
    indent = len(plain) - len(plain.lstrip(" "))
    return indent in (2, 3, 4) and "\x1b[1m" in ln and len(plain.strip()) <= 68


def render_section_body_html(sec_title: str, raw_lines: List[str]) -> str:
    """
    Transform the lines of a single man page section into structured, readable HTML.
    """
    title_upper = sec_title.upper().strip()

    while raw_lines and not strip_sgr(raw_lines[0]).strip():
        raw_lines.pop(0)
    while raw_lines and not strip_sgr(raw_lines[-1]).strip():
        raw_lines.pop()

    if not raw_lines:
        return ""

    # 1. SYNOPSIS: Render inside a dedicated syntax-highlighted C/Command signature card
    if title_upper == "SYNOPSIS":
        code_lines = []
        for ln in raw_lines:
            stripped_indent = ln[5:] if ln.startswith("     ") else (ln[3:] if ln.startswith("   ") else ln)
            code_lines.append(sgr_line_to_html(stripped_indent, link_xrefs=True))
        return f'<pre class="man-synopsis-box"><code>{"\n".join(code_lines)}</code></pre>'

    # 2. SEE ALSO: Render as a neat box of clickable cross-reference chips
    if title_upper == "SEE ALSO":
        joined_html = " ".join(sgr_line_to_html(ln.strip(), link_xrefs=True) for ln in raw_lines if strip_sgr(ln).strip())
        return f'<div class="man-see-also-box">{joined_html}</div>'

    # 3. General Section Parser: split by blank lines AND `.SS` subheadings (indent 2..4)
    blocks: List[List[str]] = []
    curr: List[str] = []
    for ln in raw_lines:
        if not strip_sgr(ln).strip():
            if curr:
                blocks.append(curr)
                curr = []
        elif is_subheading_line(ln):
            if curr:
                blocks.append(curr)
                curr = []
            blocks.append([ln])
        else:
            curr.append(ln)
    if curr:
        blocks.append(curr)

    html_blocks: List[str] = []

    for blk in blocks:
        first_plain = strip_sgr(blk[0])
        first_indent = len(first_plain) - len(first_plain.lstrip(" "))

        # Subsection header (.SS)
        if len(blk) == 1 and is_subheading_line(blk[0]):
            sub_txt = html.escape(first_plain.strip())
            html_blocks.append(f'<h4 class="man-subheading">{sub_txt}</h4>')
            continue

        plain_lines = [strip_sgr(x) for x in blk]
        indents = [len(p) - len(p.lstrip(" ")) for p in plain_lines if p.strip()]
        min_indent = min(indents) if indents else 0

        looks_like_code = (
            title_upper in ("EXAMPLES", "EXAMPLE") and min_indent >= 7
        ) or any(
            any(tok in p for tok in ("#include <", "int main(", "struct ", "┌", "│", "└", "───"))
            for p in plain_lines
        )
        looks_like_table = sum(1 for p in plain_lines if re.search(r"\s{3,}\S+\s{3,}", p.strip())) >= 3

        if looks_like_code:
            trimmed = []
            for ln in blk:
                # Strip min_indent leading spaces without breaking SGR codes
                s = re.sub(rf"^\s{{1,{min_indent}}}", "", ln)
                trimmed.append(sgr_line_to_html(s, link_xrefs=True))
            html_blocks.append(f'<pre class="man-code-block"><code>{"\n".join(trimmed)}</code></pre>')
            continue

        if looks_like_table:
            trimmed = []
            for ln in blk:
                s = re.sub(rf"^\s{{1,{min_indent}}}", "", ln)
                trimmed.append(sgr_line_to_html(s, link_xrefs=True))
            html_blocks.append(f'<pre class="man-table-block"><code>{"\n".join(trimmed)}</code></pre>')
            continue

        # Detect Tagged Definition Paragraph (.TP) — Case A: Term on line 0, body on line 1+
        if len(blk) >= 2:
            second_indent = len(plain_lines[1]) - len(plain_lines[1].lstrip(" "))
            if 4 <= first_indent <= 8 and second_indent >= first_indent + 3 and len(first_plain.strip()) <= 58:
                term_html = sgr_line_to_html(blk[0].strip(), link_xrefs=True)
                desc_html = " ".join(sgr_line_to_html(x.strip(), link_xrefs=True) for x in blk[1:])
                html_blocks.append(
                    f'<div class="man-def-card">'
                    f'<div class="man-def-term">{term_html}</div>'
                    f'<div class="man-def-desc">{desc_html}</div>'
                    f'</div>'
                )
                continue

        # Case B: Single-line or multi-line inline tagged definition (e.g. `PROT_EXEC  Pages may be executed.`)
        m_plain_inline = re.match(r"^\s{4,8}([A-Z0-9_/-]{2,26})\s{2,}(.+)$", first_plain)
        if m_plain_inline and "\x1b[1m" in blk[0] and (
            len(blk) == 1 or (len(plain_lines) > 1 and (len(plain_lines[1]) - len(plain_lines[1].lstrip(" "))) >= 10)
        ):
            term_str = m_plain_inline.group(1).strip()
            first_desc_str = m_plain_inline.group(2).strip()
            rest_desc = [sgr_line_to_html(first_desc_str, link_xrefs=True)] + [
                sgr_line_to_html(x.strip(), link_xrefs=True) for x in blk[1:]
            ]
            html_blocks.append(
                f'<div class="man-def-card">'
                f'<div class="man-def-term"><strong class="man-kw">{html.escape(term_str)}</strong></div>'
                f'<div class="man-def-desc">{" ".join(rest_desc)}</div>'
                f'</div>'
            )
            continue

        # Standard prose paragraph
        para_html = " ".join(sgr_line_to_html(x.strip(), link_xrefs=True) for x in blk)
        indent_cls = "man-para-indented" if min_indent >= 10 else "man-para"
        html_blocks.append(f'<p class="{indent_cls}">{para_html}</p>')

    return "\n".join(html_blocks)


def render_man_file_structured(man_dir: Path, sec: str, filename: str, page_name: str) -> Dict[str, Any]:
    """
    Run `tbl | groff -mandoc -rHY=0 -Tutf8 -rLL=92n` on the target man page and return
    both structured HTML sections and clean plain text for search/indexing.
    """
    raw_bytes = resolve_raw_man_bytes(man_dir, sec, filename)
    if not raw_bytes:
        return {
            "name": page_name,
            "sec": sec,
            "title": f"{page_name}({sec})",
            "summary": "",
            "sections": [],
            "html": "<p>Manual page not found.</p>",
            "plain_text": "",
            "word_count": 0,
        }

    proc = subprocess.run(
        "tbl | groff -mandoc -rHY=0 -Tutf8 -rLL=92n",
        input=raw_bytes,
        shell=True,
        capture_output=True,
    )
    sgr_output = proc.stdout.decode("utf-8", errors="replace")
    lines = sgr_output.splitlines()

    if lines and re.search(r"\([1-8][a-zA-Z]*\)", strip_sgr(lines[0])):
        lines = lines[1:]
    if lines and re.search(r"\([1-8][a-zA-Z]*\)\s*$", strip_sgr(lines[-1])):
        lines = lines[:-1]

    sections_raw: List[Dict[str, Any]] = []
    curr_title = "OVERVIEW"
    curr_lines: List[str] = []

    for ln in lines:
        plain = strip_sgr(ln)
        if plain and not plain.startswith(" ") and not plain.startswith("\t") and re.match(r"^[A-Z][A-Z0-9 _/()&-]{1,44}$", plain.strip()):
            if curr_lines:
                sections_raw.append({"title": curr_title, "lines": curr_lines})
            curr_title = plain.strip()
            curr_lines = []
        else:
            curr_lines.append(ln)

    if curr_lines:
        sections_raw.append({"title": curr_title, "lines": curr_lines})

    summary_text = ""
    structured_sections: List[Dict[str, str]] = []

    for idx, s in enumerate(sections_raw):
        stitle = s["title"]
        if stitle == "NAME":
            plain_name = " ".join(strip_sgr(x).strip() for x in s["lines"] if strip_sgr(x).strip())
            summary_text = plain_name
        sec_id = f"man-sec-{idx}-{re.sub(r'[^a-z0-9]+', '-', stitle.lower()).strip('-')}"
        body_html = render_section_body_html(stitle, list(s["lines"]))
        if body_html:
            structured_sections.append(
                {
                    "id": sec_id,
                    "title": stitle,
                    "html": body_html,
                }
            )

    plain_all = strip_sgr(sgr_output)
    word_count = len(plain_all.split())
    sec_category = SECTION_TITLES.get(str(sec), f"Linux Manual Section {sec}")

    nav_pills = "".join(
        f'<a href="javascript:void(0)" class="man-jump-pill" onclick="scrollToManSection(\'{s["id"]}\')">{html.escape(s["title"])}</a>'
        for s in structured_sections
    )

    sections_html = "".join(
        f'<section class="man-section-card" id="{s["id"]}">'
        f'<div class="man-section-header">{html.escape(s["title"])}</div>'
        f'<div class="man-section-body">{s["html"]}</div>'
        f'</section>'
        for s in structured_sections
    )

    full_html = f"""
    <div class="man-reader-wrapper">
        <div class="man-hero-banner">
            <div class="man-hero-top">
                <div>
                    <span class="man-cmd-badge">{html.escape(page_name.upper())}({html.escape(str(sec))})</span>
                    <span class="man-cat-label">{html.escape(sec_category)}</span>
                </div>
                <div class="man-hero-actions">
                    <button class="xp-toolbar-btn" onclick="openChatAndFocus('Write a practical working example showing how to use {html.escape(page_name)}({html.escape(str(sec))}) and explain its main flags/arguments.')">
                        Ask AI for Practical Example
                    </button>
                </div>
            </div>
            <div class="man-hero-summary">{html.escape(summary_text or f"{page_name}({sec}) manual page")}</div>
            <div class="man-jump-bar">
                <span class="man-jump-label">Jump to Section:</span>
                {nav_pills}
            </div>
        </div>
        <div class="man-sections-container">
            {sections_html}
        </div>
    </div>
    """

    return {
        "name": page_name,
        "sec": str(sec),
        "title": f"{page_name}({sec}) — {sec_category}",
        "summary": summary_text,
        "sections": [{"id": s["id"], "title": s["title"]} for s in structured_sections],
        "html": full_html,
        "plain_text": plain_all,
        "word_count": word_count,
    }
