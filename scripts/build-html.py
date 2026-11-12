#!/usr/bin/env python3
"""Build a self-contained PathConduit.html with inlined CSS, JS, and fonts."""
from pathlib import Path
import base64, re, sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DIST = ROOT / "dist"

def data_uri(path: Path, mime: str) -> str:
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"

def main():
    css = (SRC / "app.css").read_text(encoding="utf-8")
    fonts = f"""@font-face{{
  font-family:"Figtree";
  src:url("{data_uri(SRC / "fonts" / "Figtree-VF.woff2", "font/woff2")}") format("woff2");
  font-weight:300 900;
  font-style:normal;
  font-display:swap;
}}
@font-face{{
  font-family:"Geist Serif";
  src:url("{data_uri(SRC / "fonts" / "GeistSerifVF.woff2", "font/woff2")}") format("woff2");
  font-weight:100 900;
  font-style:normal;
  font-display:swap;
}}
"""
    js = (SRC / "extract.js").read_text(encoding="utf-8") + "\n" + (SRC / "app.js").read_text(encoding="utf-8")
    html = (SRC / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'<link rel="stylesheet" href="fonts/fonts.css">\s*', "", html)
    html = html.replace('<link rel="stylesheet" href="app.css">', f"<style>\n{fonts}\n{css}\n</style>")
    html = html.replace('<script src="extract.js"></script>\n<script src="app.js"></script>', f"<script>\n{js}\n</script>")
    DIST.mkdir(parents=True, exist_ok=True)
    out = DIST / "PathConduit.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
