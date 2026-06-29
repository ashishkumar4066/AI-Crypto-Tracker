"""
Binance-specific configuration: API credentials, coin lists, quote assets.
"""

import os

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Binance API credentials
# ---------------------------------------------------------------------------
BINANCE_API_KEY: str = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET: str = os.getenv("BINANCE_API_SECRET", "")
BINANCE_BASE_URL: str = "https://api.binance.com"

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
