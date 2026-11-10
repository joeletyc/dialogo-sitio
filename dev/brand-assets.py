"""Renders og-default.png, apple-touch-icon.png and favicon-32.png with the site fonts.
Usage: python3 dev/brand-assets.py  (needs playwright + Chrome)"""
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
fonts = (root / 'assets/fonts').as_uri()
css = f"""@font-face{{font-family:A;src:url({fonts}/archivo-latin-wdth-normal.woff2);font-weight:100 900;font-stretch:62% 125%}}
body{{margin:0}} .b{{font-family:A;font-weight:850;font-stretch:68%;color:#fff;background:#d2101a;border-radius:.16em;padding:.1em .32em .16em;position:relative;display:inline-block;line-height:1}}
.b:after{{content:'';position:absolute;left:.42em;bottom:-.3em;border-style:solid;border-width:.32em .34em 0 0;border-color:#d2101a transparent transparent transparent}}"""
pages = {
 'og-default.png': (1200, 630, f"<div style='width:1200px;height:630px;background:#000;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box'><div><span class=b style='font-size:150px'>Diálogo</span></div><p style='font-family:A;font-stretch:85%;font-weight:600;color:#ddd;font-size:44px;margin:60px 0 0'>Noticias de Apatzingán y Tierra Caliente</p></div>"),
 'apple-touch-icon.png': (180, 180, "<div style='width:180px;height:180px;background:#d2101a;display:grid;place-items:center'><span style='font-family:A;font-weight:900;font-stretch:70%;color:#fff;font-size:150px;line-height:1;margin-top:-8px'>D</span></div>"),
 'favicon-32.png': (32, 32, "<div style='width:32px;height:32px;background:#d2101a;border-radius:5px;display:grid;place-items:center'><span style='font-family:A;font-weight:900;font-stretch:75%;color:#fff;font-size:27px;line-height:1'>D</span></div>"),
}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for name, (w, h, html) in pages.items():
        pg = b.new_page(viewport={'width': w, 'height': h})
        tmp = root / 'dev' / '_tmp.html'
        tmp.write_text(f"<meta charset=utf-8><style>{css}</style>{html}", encoding='utf-8')
        pg.goto(tmp.as_uri())
        pg.evaluate('document.fonts.ready')
        pg.wait_for_timeout(300)
        tmp.unlink()
        pg.screenshot(path=str(root / 'assets/img' / name))
    b.close()
print('ok')
