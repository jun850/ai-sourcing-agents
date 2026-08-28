from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = [
    ("01-intake-taxonomy.md", "atelix-rfq-intake-taxonomy.pdf"),
    ("02-agent-intake-playbook.md", "atelix-rfq-agent-intake-playbook.pdf"),
    ("03-buyer-minimum-brief-guide.md", "atelix-buyer-minimum-brief-guide.pdf"),
]

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="AtelixTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=HexColor("#20342a"), spaceAfter=12))
styles.add(ParagraphStyle(name="AtelixH1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=HexColor("#426c4e"), spaceBefore=15, spaceAfter=7))
styles.add(ParagraphStyle(name="AtelixBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=10.4, leading=15, textColor=HexColor("#354357"), spaceAfter=6))

def esc(text): return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def build(source, destination):
    story = []
    for line in (ROOT / "docs" / "rfq-knowledge" / source).read_text().splitlines():
        clean = line.strip()
        if not clean:
            story.append(Spacer(1, 4)); continue
        if clean.startswith("# "):
            story.append(Paragraph(esc(clean[2:]), styles["AtelixTitle"]))
        elif clean.startswith("### "):
            story.append(Paragraph(esc(clean[4:]), styles["AtelixBody"]))
        elif clean.startswith("## "):
            story.append(Paragraph(esc(clean[3:]), styles["AtelixH1"]))
        elif len(clean) > 2 and clean[0].isdigit() and clean[1:3] == ". ":
            story.append(Paragraph(esc(clean), styles["AtelixBody"]))
            story.append(Spacer(1, 2))
        elif clean.startswith("- "):
            story.append(Paragraph("• " + esc(clean[2:]), styles["AtelixBody"]))
            story.append(Spacer(1, 2))
        else:
            story.append(Paragraph(esc(clean.replace("`", "")), styles["AtelixBody"]))
    doc = SimpleDocTemplate(str(OUT / destination), pagesize=A4, leftMargin=22*mm, rightMargin=22*mm, topMargin=22*mm, bottomMargin=18*mm, title="Atelix RFQ knowledge")
    doc.build(story)

for source, destination in SOURCES: build(source, destination)
