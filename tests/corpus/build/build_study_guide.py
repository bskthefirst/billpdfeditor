"""Builds public/samples/study-guide.pdf: 24 pages, 4 chapters with bookmarks (level 1 + 2), one colour per chapter.
Used as the demo for Pages / Split. Run: python3 tests/corpus/build/build_study_guide.py"""
import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white, black

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "samples", "study-guide.pdf")
W, H = letter
CHAPTERS = [
    ("Chapter 1 · Getting started", "#ff7aa8", ["Why PDFs are hard", "Opening a file", "Your first edit"]),
    ("Chapter 2 · Editing text", "#36d6b3", ["Fonts that match", "Lines and spacing", "When a glyph is missing"]),
    ("Chapter 3 · Organizing pages", "#ffd23f", ["Reordering", "Rotating and deleting", "Merging files"]),
    ("Chapter 4 · Splitting", "#6aa8ff", ["Page ranges", "Every N pages", "By bookmarks"]),
]
LOREM = [
    "Every page in this guide is real PDF text set in a standard font, so you can click any line and edit it.",
    "Try changing a heading, then open Pages to move this page somewhere else or split the chapter out.",
    "Nothing leaves your computer: the file is opened, edited and saved entirely inside your browser.",
    "Split by ranges such as 1-3, 7, 9-12, every N pages, or one file per bookmark in this outline.",
    "Copied pages are exact: fonts, images and text are byte-for-byte what the original page used.",
]

c = canvas.Canvas(OUT, pagesize=letter, pageCompression=1)
c.setTitle("Sticker Study Guide")
c.setAuthor("Sticker PDF Lab")
c.setSubject("Sample document for the Pages and Split tools")
page = 0
for ci, (title, color, sections) in enumerate(CHAPTERS):
    for k in range(6):
        page += 1
        c.setFillColor(HexColor(color))
        c.rect(0, H - 90, W, 90, stroke=0, fill=1)
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 26)
        c.drawString(54, H - 58, title)
        c.setFont("Helvetica", 11)
        c.drawRightString(W - 54, H - 58, f"Page {page} of 24")
        if k == 0:  # one destination per outline entry (reportlab keys entries by destination name)
            c.bookmarkPage(f"chapter{ci}")
            c.addOutlineEntry(title, f"chapter{ci}", level=0, closed=False)
        if k in (0, 2, 4):
            sec = sections[k // 2]
            c.bookmarkPage(f"section{page}")
            c.addOutlineEntry(sec, f"section{page}", level=1)
            heading = sec
        else:
            heading = f"{sections[min(k // 2, 2)]} (continued)"
        c.setFont("Times-Bold", 20)
        c.drawString(54, H - 135, heading)
        c.setFont("Times-Roman", 13)
        y = H - 170
        for para in range(4):
            for line in LOREM:
                c.drawString(54, y, line)
                y -= 20
            y -= 12
        c.setFont("Helvetica", 9)
        c.setFillColor(HexColor("#6b6578"))
        c.drawCentredString(W / 2, 36, f"{title}  ·  {page}")
        # navigation links: inside the chapter, to the neighbouring chapters (they go dead when a chapter is split out)
        c.setFillColor(HexColor("#2457c5"))
        c.setFont("Helvetica", 10)
        links = []
        if k > 0:
            links.append((54, f"Start of chapter {ci + 1} ↑".replace("↑", "^"), f"chapter{ci}"))
        if ci > 0:
            links.append((260, f"Chapter {ci} <", f"chapter{ci - 1}"))
        if ci < len(CHAPTERS) - 1:
            links.append((420, f"> Chapter {ci + 2}", f"chapter{ci + 1}"))
        for x, label, dest in links:
            c.drawString(x, 54, label)
            c.linkRect("", dest, (x, 48, x + c.stringWidth(label, "Helvetica", 10), 64), relative=0, thickness=0)
        c.showPage()
c.save()
print("wrote", os.path.abspath(OUT))
