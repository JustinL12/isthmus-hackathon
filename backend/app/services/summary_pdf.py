"""Take-home summary as a PDF (same sections as frontend/src/app/summary/[token]/page.tsx)."""

import os

from fpdf import FPDF

from ..models import Plan, PlanItem

DISCLAIMER = (
    "Your vet makes the final call. Prices shown are samples and may differ from your final bill. "
    "If your pet gets worse, contact your vet or an emergency clinic right away."
)

# Built-in PDF fonts are Latin-1 only.
_REPLACE = {"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "·": "-", "…": "..."}


def _t(s: str) -> str:
    for a, b in _REPLACE.items():
        s = s.replace(a, b)
    return s.encode("latin-1", "replace").decode("latin-1")


def share_url(plan: Plan) -> str:
    base = os.getenv("PUBLIC_APP_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/summary/{plan.share_token}"


def money(x: float) -> str:
    return f"${x:,.2f}"


def build_pdf(plan: Plan) -> bytes:
    done = [i for i in plan.items if i.selected]
    recheck = [i for i in plan.items if not i.selected and i.group == "soon"]
    later = [i for i in plan.items if not i.selected and i.group != "soon"]

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 12, _t(f"{plan.pet.name}'s care plan"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, _t(f"For {plan.owner_name}" + (f" - {plan.pet.reason}" if plan.pet.reason else "")), new_x="LMARGIN", new_y="NEXT")
    if plan.payment_choice == "split":
        pdf.cell(0, 7, "Payment: split into 4 payments", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    _section(pdf, f"Done today ({money(sum(i.price for i in done))})", done)
    _section(pdf, "Scheduled for a recheck", recheck, show_date=True)
    _section(pdf, "Revisit at next visit", later, show_date=True)

    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, _t(f"View or share this plan online: {share_url(plan)}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(0, 5, _t(DISCLAIMER), new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def _section(pdf: FPDF, title: str, items: list[PlanItem], show_date: bool = False):
    if not items:
        return
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 9, _t(title), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    for i in items:
        label = i.name + (f"  (by {i.recheck_date:%b %d, %Y})" if show_date and i.recheck_date else "")
        pdf.cell(150, 7, _t(label))
        pdf.cell(0, 7, money(i.price), align="R", new_x="LMARGIN", new_y="NEXT")
        if i.explanation and not i.selected:
            pdf.set_text_color(100, 100, 100)
            pdf.set_font("Helvetica", "", 9)
            pdf.multi_cell(0, 5, _t(f"If postponed: {i.explanation.if_postponed}"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            pdf.set_font("Helvetica", "", 11)
    pdf.ln(3)
