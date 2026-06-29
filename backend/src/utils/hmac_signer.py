"""
Generic HMAC-SHA256 signing utility for Binance-style API authentication.

Binance requires:
  1. All query-string params (including `timestamp`) sorted/concatenated.
  2. HMAC-SHA256 of that string using the API secret.
  3. The hex-digest appended as `&signature=<sig>`.
"""

import hashlib
import hmac
import time
from urllib.parse import urlencode


def get_timestamp_ms() -> int:
    """Current UTC time in milliseconds (Binance server-time format)."""
    return int(time.time() * 1000)


def sign_params(params: dict, api_secret: str) -> dict:
    """
    Add ``timestamp`` (if missing) and ``signature`` to *params*.

    Returns a **new** dict with the original params plus timestamp + signature,
    ready to be sent as query-string parameters.
    """
    params = dict(params)  # shallow copy so caller's dict isn't mutated
    if "timestamp" not in params:
        params["timestamp"] = get_timestamp_ms()

    query_string = urlencode(params)
    signature = hmac.HMAC(
        api_secret.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    params["signature"] = signature
    return params
