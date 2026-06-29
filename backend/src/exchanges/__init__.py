from src.exchanges.binance import BinanceConnector, BINANCE_PARSERS, binance_detect_type, BINANCE_WALLET_META, binance_get_wallet_meta
from src.exchanges.binance.config import BINANCE_API_KEY, BINANCE_API_SECRET

_REGISTRY = {
    "binance": {
        "connector_class": BinanceConnector,
        "parsers": BINANCE_PARSERS,
        "detect_type": binance_detect_type,
        "wallet_meta": BINANCE_WALLET_META,
        "get_wallet_meta": binance_get_wallet_meta,
        "api_key": BINANCE_API_KEY,
        "api_secret": BINANCE_API_SECRET,
    },
}


def get_exchange(name: str) -> dict:
    return _REGISTRY.get(name, {})


def get_connector(name: str):
    ex = _REGISTRY.get(name)
    if not ex:
        raise ValueError(f"Unknown exchange: {name}")
    return ex["connector_class"](ex["api_key"], ex["api_secret"])


def get_all_parsers() -> dict:
    """Merge all exchange parsers into one dict."""
    merged = {}
    for ex in _REGISTRY.values():
        merged.update(ex["parsers"])
    return merged


def detect_file_type(row3_text: str) -> tuple[str | None, str | None]:
    """Try each exchange's detect function. Returns (exchange_name, detected_type) or (None, None)."""
    for name, ex in _REGISTRY.items():
        detected = ex["detect_type"](row3_text)
        if detected:
            return name, detected
    return None, None


def get_all_wallet_meta() -> dict:
    merged = {}
    for ex in _REGISTRY.values():
        merged.update(ex.get("wallet_meta", {}))
    return merged


def get_wallet_meta_fn(exchange_name: str):
    ex = _REGISTRY.get(exchange_name)
    if ex:
        return ex.get("get_wallet_meta")
    return None


SUPPORTED_EXCHANGES = list(_REGISTRY.keys())
