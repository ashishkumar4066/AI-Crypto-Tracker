"""
Application configuration: env vars, FY date ranges, constants.
"""

import os
from datetime import datetime, timezone
from typing import Dict, Tuple

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Binance API credentials
# ---------------------------------------------------------------------------
BINANCE_API_KEY: str = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET: str = os.getenv("BINANCE_API_SECRET", "")
BINANCE_BASE_URL: str = "https://api.binance.com"

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
# Coins that were only spot-traded and fully sold (no deposit/withdrawal
# record), so they won't be discovered automatically.
# ---------------------------------------------------------------------------
MANUAL_COINS: set[str] = {
    "SOL",
    "ETH",
    "TRX",
    "TAO",
    "LINK",
    "FET",
    "ADA",
    "ONDO",
    "MATIC",
    "AVAX",
    "NEAR",
    "AERO",
    "DOGE",
    "RENDER",
    "SUI",
    "AR",
    "SUPER",
    "AKT",
    "TON",
    "PENDLE",
    "XRP",
    "ALGO",
    "PYTH",
    "ATH",
    "SEI",
    "ZK",
    "OCEAN",
    "GALA",
    "ARB",
    "VANRY",
    "APT",
    "JOE",
    "MOG",
    "WMTX",
    "NUM",
    "CPOOL",
    "AGI",
    "INJ",
    "RUNE",
    "MANA",
    "BEAM",
    "SAND",
    "GHX",
    "LUMIA",
    "COQ",
    "ILV",
    "SHIB",
    "WILD",
    "GAME",
    "BRETT",
    "ORN",
    "APE",
    "SUNDOG",
    "HEART",
    "GOAT",
    "CTSI",
    "OP",
    "TAI",
    "IO",
    "PAAL",
    "FOXY",
    "ZEREBRO",
    "EOS",
    "GRIFFAIN",
    "USUAL",
    "SFUND",
    "G3",
    "NTRN",
    "MONKY",
    "SHRAP",
    "MARCO",
    "CWIF",
    "NFT",
    "SOLO",
    "ETHW",
    "LUNA",
    "AI",
    "LEMX",
    "AGIX",
    "PEPE",
    "PUMP",
}

QUOTE_ASSETS: list[str] = [
    "USDT", "BTC", "BNB", "ETH", "BUSD", "FDUSD", "USDC", "INR",
]

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
REQUEST_DELAY_MS: int = 150  # minimum gap between API calls
RECV_WINDOW: int = 10000     # Binance recvWindow in ms
