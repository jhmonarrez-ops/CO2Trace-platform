#!/usr/bin/env python3
"""Keep the Content Security Policy in index.html in step with its inline scripts.

GitHub Pages cannot send HTTP headers, so the policy lives in a <meta http-equiv> tag right after
<meta charset>. Inline scripts are allowed by SHA-256 hash, so any edit to an inline <script> changes
its hash and the browser will refuse to run it until this tool is re-run.

    python3 tools/security/csp.py          # rewrite the policy in index.html
    python3 tools/security/csp.py --check  # exit 1 if the policy is out of date (for CI or a pre-commit hook)
"""
import base64, hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PAGE = ROOT / 'index.html'

# Everything the page loads: fonts from Google, Lenis from jsDelivr (pinned with SRI), the rest same-origin.
# 'unsafe-inline' for styles is needed for style="" attributes (CSS custom properties per element); scripts stay strict.
BASE = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net {hashes}",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "frame-src blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "worker-src 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
]

def build(html):
    scripts = re.findall(r'<script>(.*?)</script>', html, flags=re.S)
    hashes = ' '.join("'sha256-%s'" % base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode() for s in scripts)
    return '; '.join(BASE).format(hashes=hashes), len(scripts)

def main():
    html = PAGE.read_text(encoding='utf-8')
    policy, n = build(html)
    tag = f'<meta http-equiv="Content-Security-Policy" content="{policy}">'
    current = re.search(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">', html)
    if '--check' in sys.argv:
        ok = bool(current) and current.group(0) == tag
        print(('CSP up to date' if ok else 'CSP out of date: run python3 tools/security/csp.py') + f' ({n} inline scripts)')
        sys.exit(0 if ok else 1)
    if current:
        html = html.replace(current.group(0), tag)
    else:
        html = html.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n' + tag + '\n', 1)
    PAGE.write_text(html, encoding='utf-8')
    print(f'CSP written ({n} inline scripts hashed)')

if __name__ == '__main__':
    main()
