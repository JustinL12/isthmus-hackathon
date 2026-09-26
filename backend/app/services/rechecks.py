"""Semester-aware recheck dates: avoid finals and breaks, flag dates after the owner leaves Madison."""

from datetime import date, timedelta

# TODO: confirm against the official UW–Madison academic calendar.
BLACKOUTS: list[tuple[date, date, str]] = [
    (date(2026, 11, 26), date(2026, 11, 29), "Thanksgiving break"),
    (date(2026, 12, 12), date(2026, 12, 18), "Fall finals"),
    (date(2026, 12, 19), date(2027, 1, 19), "Winter break"),
]

DEFAULT_DAYS = {"soon": 10, "optional": 60}


def suggest_recheck(group: str, today: date | None = None) -> date | None:
    """Pick a date `DEFAULT_DAYS[group]` out, pushed past any blackout window."""
    if group not in DEFAULT_DAYS:
        return None
    d = (today or date.today()) + timedelta(days=DEFAULT_DAYS[group])
    for start, end, _ in BLACKOUTS:
        if start <= d <= end:
            d = end + timedelta(days=1)
    return d
