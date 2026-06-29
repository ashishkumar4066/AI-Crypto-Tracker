"""
Binance wallet metadata, action labels, and graph-helper functions.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Wallet display config
# ---------------------------------------------------------------------------

WALLET_META: dict[str, dict[str, str]] = {
    "binance_spot": {
        "label": "Binance Spot",
        "subtitle": "Trading Wallet",
        "icon": "candlestick-chart",
        "variant": "exchange",
    },
    "binance_p2p": {
        "label": "Binance P2P",
        "subtitle": "P2P Wallet",
        "icon": "wallet",
        "variant": "exchange",
    },
    "binance_convert": {
        "label": "Binance Convert",
        "subtitle": "Convert",
        "icon": "wallet",
        "variant": "exchange",
    },
    "binance_fiat": {
        "label": "Binance Fiat",
        "subtitle": "Fiat Gateway",
        "icon": "landmark",
        "variant": "source",
    },
    "inr_entry": {
        "label": "Bank Account",
        "subtitle": "INR Fiat",
        "icon": "landmark",
        "variant": "source",
    },
}

ACTION_TYPE_MAP: dict[str, str] = {
    "BUY": "BUY",
    "SELL": "SELL",
    "P2P_BUY": "BUY",
    "P2P_SELL": "SELL",
    "DEPOSIT": "DEPOSIT",
    "WITHDRAWAL": "WITHDRAWAL",
    "CONVERT": "CONVERT",
    "DUST_CONVERSION": "DUST",
    "FIAT_BUY": "BUY",
    "FIAT_SELL": "SELL",
    "INTERNAL_TRANSFER": "INTERNAL_TRANSFER",
}

ACTION_LABELS: dict[str, str] = {
    "BUY": "Buy",
    "SELL": "Sell",
    "P2P_BUY": "P2P Buy",
    "P2P_SELL": "P2P Sell",
    "DEPOSIT": "Deposit",
    "WITHDRAWAL": "Withdraw",
    "CONVERT": "Convert",
    "DUST_CONVERSION": "Dust Convert",
    "FIAT_BUY": "Fiat Buy",
    "FIAT_SELL": "Fiat Sell",
    "INTERNAL_TRANSFER": "Transfer",
}

COL_ORDER: dict[str, int] = {
    "inr_entry": 0,
    "binance_p2p": 1,
    "binance_fiat": 1,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def wallet_id(name: str) -> str:
    if not name:
        return "unknown"
    if name.startswith("external_"):
        addr = name[len("external_"):]
        if len(addr) > 10:
            return f"ext_{addr[:8]}"
        return f"ext_{addr}"
    return name.replace(" ", "_").lower()


def get_wallet_meta(wallet_id_str: str, raw_name: str) -> dict[str, str]:
    if wallet_id_str in WALLET_META:
        return dict(WALLET_META[wallet_id_str])
    if wallet_id_str.startswith("ext_"):
        return {
            "label": f"External {wallet_id_str[4:8]}...",
            "subtitle": "External Wallet",
            "icon": "hard-drive",
            "variant": "external",
        }
    return {
        "label": raw_name or wallet_id_str,
        "subtitle": "Wallet",
        "icon": "wallet",
        "variant": "exchange",
    }


def edge_color(txn_type: str, direction: str) -> str:
    colors = {
        "BUY": "#10b981",
        "P2P_BUY": "#10b981",
        "FIAT_BUY": "#10b981",
        "SELL": "#f43f5e",
        "P2P_SELL": "#f43f5e",
        "FIAT_SELL": "#f43f5e",
        "DEPOSIT": "#3b82f6",
        "WITHDRAWAL": "#f59e0b",
        "CONVERT": "#8b5cf6",
        "DUST_CONVERSION": "#9ca3af",
        "INTERNAL_TRANSFER": "#0ea5e9",
    }
    return colors.get(txn_type, "#6b7280")
