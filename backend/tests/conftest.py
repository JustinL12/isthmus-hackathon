import os

# Force the offline setup before app modules read env (load_dotenv won't override these).
for key in ("DATABASE_URL", "DATABRICKS_HOST", "DATABRICKS_HTTP_PATH", "DATABRICKS_TOKEN",
            "ANTHROPIC_API_KEY", "RESEND_API_KEY"):
    os.environ[key] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture
def client():
    return TestClient(app)


MOCHI = {
    "pet": {"name": "Mochi", "species": "cat", "age_years": 12, "reason": "Vomiting"},
    "owner_name": "Alex",
    "budget": 400,
}
