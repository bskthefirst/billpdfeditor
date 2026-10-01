#!/usr/bin/env python3
"""Generate synthetic corpus PDFs with reportlab (standard-14 + embedded TTF subsets + rotated text).

Chrome-printed PDFs are produced separately from the *.html files in this folder (see build_corpus.sh).
Usage: python3 tests/corpus/build/build_corpus.py
"""
import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "pdf")
os.makedirs(OUT, exist_ok=True)
SUP = "/System/Library/Fonts/Supplemental"


def reg(name, path, **kw):
    if os.path.exists(path):
        pdfmetrics.registerFont(TTFont(name, path, **kw))
        return True
    return False


def std14():
    c = canvas.Canvas(os.path.join(OUT, "rl_standard14.pdf"), pagesize=letter, pageCompression=0)
    c.setTitle("Corpus: standard 14 fonts (not embedded)")
    y = 720
    for fam in ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Times-Roman", "Times-Bold", "Times-Italic", "Courier", "Courier-Bold"]:
        c.setFont(fam, 14)
        c.drawString(72, y, f"{fam}: The quick brown fox jumps over the lazy dog 0123456789")
        y -= 28
    c.setFont("Helvetica", 9)
    c.drawString(72, y - 10, "Small print at 9 pt: terms and conditions apply. Edit this sentence.")
    c.setFillColorRGB(0.78, 0.16, 0.16)
    c.setFont("Times-Bold", 20)
    c.drawString(72, y - 50, "Colored 20 pt bold title")
    c.save()


def embedded_ttf():
    ok_a = reg("ArialTT", f"{SUP}/Arial.ttf")
    ok_g = reg("GeorgiaTT", f"{SUP}/Georgia.ttf")
    ok_k = reg("AppleGothicTT", f"{SUP}/AppleGothic.ttf")
    c = canvas.Canvas(os.path.join(OUT, "rl_embedded_ttf.pdf"), pagesize=letter, pageCompression=1)
    c.setTitle("Corpus: embedded TrueType subsets")
    y = 720
    if ok_a:
        c.setFont("ArialTT", 12)
        c.drawString(72, y, "Arial (embedded subset): Hello world, this is a sample line.")
        y -= 24
    if ok_g:
        c.setFont("GeorgiaTT", 16)
        c.drawString(72, y, "Georgia 16 pt heading: Annual summary")
        y -= 30
    if ok_k:
        c.setFont("AppleGothicTT", 12)
        c.drawString(72, y, "한글 임베디드 글꼴: 안녕하세요 세계")
        y -= 24
    # character / word spacing + horizontal scaling (Tc/Tw/Tz)
    if ok_a:
        t = c.beginText(72, y)
        t.setFont("ArialTT", 12)
        t.setCharSpace(1.5)
        t.textLine("Char spacing 1.5 pt applied to this line")
        t.setCharSpace(0)
        t.setWordSpace(6)
        t.textLine("Word spacing 6 pt applied to this line")
        t.setWordSpace(0)
        t.setHorizScale(85)
        t.textLine("Horizontal scale 85 percent on this line")
        c.drawText(t)
        y -= 70
    # rotated text
    if ok_a:
        c.saveState()
        c.translate(420, 300)
        c.rotate(35)
        c.setFont("ArialTT", 14)
        c.drawString(0, 0, "Rotated 35 degrees")
        c.restoreState()
    c.save()


def cmyk_gradient():
    from reportlab.lib.colors import CMYKColor, Color

    c = canvas.Canvas(os.path.join(OUT, "rl_cmyk_gradient.pdf"), pagesize=letter, pageCompression=0)
    c.setTitle("Corpus: CMYK text, spot color, gradient, alpha")
    c.setFillColor(CMYKColor(0, 0, 0, 1)); c.setFont("Helvetica-Bold", 24); c.drawString(72, 720, "Rich CMYK black heading (0 0 0 1 k)")
    c.setFillColor(CMYKColor(1, 0.8, 0, 0)); c.setFont("Times-Roman", 14); c.drawString(72, 690, "CMYK blue body text that must stay CMYK in print workflows")
    c.setFillColor(CMYKColor(0, 1, 1, 0, spotName="PANTONE 485 C", density=1)); c.rect(72, 600, 200, 60, fill=1, stroke=0)
    c.setFillColor(Color(0, 0, 0)); c.setFont("Helvetica", 12); c.drawString(72, 570, "Editable line next to a gradient and transparency")
    c.saveState()
    path = c.beginPath(); path.rect(72, 480, 300, 60); c.clipPath(path, stroke=0, fill=0)
    c.linearGradient(72, 480, 372, 540, (Color(1, 0, 0), Color(0, 0, 1)), extend=False)
    c.restoreState()
    c.setFillAlpha(0.4); c.setFillColor(Color(0, 0.6, 0)); c.circle(300, 440, 50, fill=1, stroke=0)
    c.save()


def raw_pdf(path, content, fonts=None, pagesize=(612, 792)):
    """Assemble a tiny PDF by hand so we control the exact operators (reportlab never emits TJ gap adjustments)."""
    fonts = fonts or {"F1": "Helvetica", "F2": "Times-Roman"}
    objs = []
    objs.append("<< /Type /Catalog /Pages 2 0 R >>")
    objs.append("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    font_refs = " ".join(f"/{k} {5 + i} 0 R" for i, k in enumerate(fonts))
    objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pagesize[0]} {pagesize[1]}] /Contents 4 0 R /Resources << /Font << {font_refs} >> >> >>")
    objs.append(f"<< /Length {len(content)} >>\nstream\n{content}\nendstream")
    for base in fonts.values():
        objs.append(f"<< /Type /Font /Subtype /Type1 /BaseFont /{base} /Encoding /WinAnsiEncoding >>")
    out = "%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out.encode("latin1")))
        out += f"{i} 0 obj\n{o}\nendobj\n"
    xref = len(out.encode("latin1"))
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    open(path, "wb").write(out.encode("latin1"))


def tj_gaps():
    # Word gaps encoded as TJ adjustments (pdfTeX style), tracking via Tc, per-glyph operators, and a justified-looking line.
    global content
    content = "\n".join([
        "BT /F2 14 Tf 72 700 Td [(The)-250(quick)-250(brown)-250(fox)-250(jumps)-250(over)]TJ ET",
        "BT /F2 14 Tf 72 676 Td [(Kerning)-250(pairs)-250(like)-250(A)120(V)-250(and)-250(T)80(o)-250(stay)]TJ ET",
        "BT /F1 12 Tf 72 640 Td 1.5 Tc (Tracked) Tj 0 Tc ( heading) Tj ET",
        "BT /F1 12 Tf 72 610 Td (A) Tj 7.3 0 Td (b) Tj 6.7 0 Td (c) Tj ET",
        "BT /F1 12 Tf 72 580 Td (Total:) Tj 200 0 Td (1,234.00) Tj ET",
    ])
    raw_pdf(os.path.join(OUT, "raw_tj_gaps.pdf"), content)


def encrypted():
    from reportlab.lib.pdfencrypt import StandardEncryption

    def make(name, enc):
        c = canvas.Canvas(os.path.join(OUT, name), pagesize=letter, encrypt=enc)
        c.setFont("Helvetica", 14)
        c.drawString(72, 700, "Protected quarterly summary: revenue grew steadily")
        c.setFont("Times-Roman", 12)
        c.drawString(72, 676, "Only the owner may change this document")
        c.save()

    # empty user password, editing forbidden: opens everywhere, restrictions are advisory
    make("rl_encrypted_owner.pdf", StandardEncryption("", ownerPassword="owner-secret", canModify=0, canCopy=1, strength=128))
    # real user password: needs "secret" to open
    make("rl_encrypted_user.pdf", StandardEncryption("secret", ownerPassword="owner-secret", strength=128))


def multipage():
    c = canvas.Canvas(os.path.join(OUT, "rl_multipage.pdf"), pagesize=letter)
    c.setTitle("Corpus: 30 pages")
    for p in range(1, 31):
        c.setFont("Helvetica-Bold", 18)
        c.drawString(72, 720, f"Page {p}")
        c.setFont("Times-Roman", 11)
        for i in range(40):
            c.drawString(72, 690 - i * 14, f"Line {i + 1} of page {p}: lorem ipsum dolor sit amet consectetur.")
        c.showPage()
    c.save()


if __name__ == "__main__":
    std14()
    embedded_ttf()
    cmyk_gradient()
    tj_gaps()
    encrypted()
    multipage()
    print("wrote", sorted(os.listdir(OUT)))
