"""
Application configuration: env vars, FY date ranges, constants.
"""

import os
from datetime import datetime, timezone
from typing import Dict, Tuple

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DATABASE_PATH: str = os.path.join(DATABASE_DIR, "crypto_tracker.db")
DATABASE_URL: str = f"sqlite:///{DATABASE_PATH}"

# ---------------------------------------------------------------------------
# Financial year date ranges (UTC)
# Indian FY runs April 1 -> March 31
# ---------------------------------------------------------------------------
FY_DATE_RANGES: Dict[str, Tuple[datetime, datetime]] = {
    "2020-21": (
        datetime(2020, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(2021, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
    ),
    "2021-22": (
        datetime(2021, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(2022, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
    ),
    "2022-23": (
        datetime(2022, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(2023, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
    ),
    "2023-24": (
        datetime(2023, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(2024, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
    ),
    "2024-25": (
        datetime(2024, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(2025, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
    ),
    "2025-26": (
        datetime(2025, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(2026, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
    ),
    "2026-27": (
        datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(2027, 3, 31, 23, 59, 59, tzinfo=timezone.utc),
    ),
}

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
REQUEST_DELAY_MS: int = 150  # minimum gap between API calls
RECV_WINDOW: int = 10000     # Binance recvWindow in ms
