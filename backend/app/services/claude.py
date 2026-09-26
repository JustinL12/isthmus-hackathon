"""Claude API helpers (stretch goal: estimate PDF upload).

Before filling these in, check current model IDs and the PDF/document input
format in the Anthropic docs.
"""

import os

from ..models import Explanation, ParsedLineItem

MODEL = "claude-sonnet-5"


def is_configured() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


async def parse_estimate(file_bytes: bytes, media_type: str) -> list[ParsedLineItem]:
    """Read an estimate PDF/photo and return its line items as JSON."""
    # TODO: send the file as a document/image block, ask for
    # [{"raw_name": str, "price": float}] via structured output, then run each
    # through services.matching.match_catalog_id.
    raise NotImplementedError


async def draft_explanation(item_name: str) -> Explanation:
    """Draft an explanation for an item missing from the library (vet must review)."""
    # TODO
    raise NotImplementedError
