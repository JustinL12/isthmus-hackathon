"""Send the take-home summary by email through Resend's REST API.

Note: until a domain is verified in Resend, the test sender (onboarding@resend.dev)
can only deliver to the Resend account owner's own address.
"""

import base64
import html
import logging
import os

import httpx

from ..models import Plan
from .summary_pdf import build_pdf, share_url

log = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(os.getenv("RESEND_API_KEY"))


def send_summary(plan: Plan, to: str) -> None:
    """Raises on failure; callers decide whether that matters."""
    pet = html.escape(plan.pet.name)
    url = share_url(plan)
    body = (
        f"<p>Hi {html.escape(plan.owner_name)},</p>"
        f"<p>Here is {pet}'s care plan from today's visit. The PDF is attached, "
        f'and you can view or share it here: <a href="{url}">{url}</a></p>'
        "<p>Your vet makes the final call. If your pet gets worse, contact your vet right away.</p>"
    )
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
        json={
            "from": os.getenv("EMAIL_FROM", "ClearCare <onboarding@resend.dev>"),
            "to": [to],
            "subject": f"{plan.pet.name}'s care plan",
            "html": body,
            "attachments": [
                {"filename": f"{plan.pet.name}-care-plan.pdf", "content": base64.b64encode(build_pdf(plan)).decode()}
            ],
        },
        timeout=15,
    )
    resp.raise_for_status()


def send_summary_quietly(plan: Plan, to: str) -> None:
    """For background tasks: log instead of raising."""
    try:
        send_summary(plan, to)
    except Exception:
        log.exception("Summary email failed for plan %s", plan.id)
