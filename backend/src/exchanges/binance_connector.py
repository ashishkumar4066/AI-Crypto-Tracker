"""
Full Binance REST-API connector.

Covers all 8 endpoint categories:
  1. Account balances       (/api/v3/account)
  2. Spot trades            (/api/v3/myTrades)           — fromId pagination
  3. Deposits               (/sapi/v1/capital/deposit/hisrec)  — 90-day + offset
  4. Withdrawals            (/sapi/v1/capital/withdraw/history) — 90-day + offset
  5. P2P / C2C trades       (/sapi/v1/c2c/orderMatch/listUserOrderHistory) — page
  6. Fiat orders            (/sapi/v1/fiat/orders)       — page
  7. Dust conversions       (/sapi/v1/asset/dribblet)    — 90-day chunks
  8. Convert trade flow     (/sapi/v1/convert/tradeFlow) — 30-day chunks

Plus the symbol-discovery pipeline and data normalisation into the unified
transaction schema.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

import requests

from src.config import (
    BINANCE_API_KEY,
    BINANCE_API_SECRET,
    BINANCE_BASE_URL,
    MANUAL_COINS,
    QUOTE_ASSETS,
    RECV_WINDOW,
    REQUEST_DELAY_MS,
)
from src.utils.hmac_signer import sign_params

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ms(dt: datetime) -> int:
    """Datetime -> epoch milliseconds."""
    return int(dt.timestamp() * 1000)


def _iso(epoch_ms: int | float | str) -> str:
    """Epoch-ms (int or numeric string) -> ISO-8601 UTC string."""
    return datetime.fromtimestamp(
        int(float(epoch_ms)) / 1000, tz=timezone.utc
    ).isoformat()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return uuid.uuid4().hex


# ---------------------------------------------------------------------------
# Connector
# ---------------------------------------------------------------------------

class BinanceConnector:
    """
    Production Binance data extractor.

    Usage::

        bc = BinanceConnector(api_key, api_secret)
        txns = bc.sync_all(start_dt, end_dt)
    """

    EXCHANGE = "binance"

    def __init__(
        self,
        api_key: str = BINANCE_API_KEY,
        api_secret: str = BINANCE_API_SECRET,
        base_url: str = BINANCE_BASE_URL,
    ):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url.rstrip("/")
        self._session = requests.Session()
        self._session.headers.update({"X-MBX-APIKEY": self.api_key})
        self._last_request_ts: float = 0.0

    # ----- low-level request ----------------------------------------------

    def _throttle(self) -> None:
        """Enforce minimum gap between requests."""
        elapsed_ms = (time.time() - self._last_request_ts) * 1000
        if elapsed_ms < REQUEST_DELAY_MS:
            time.sleep((REQUEST_DELAY_MS - elapsed_ms) / 1000)

    def _request(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        signed: bool = True,
        max_retries: int = 5,
    ) -> Any:
        """
        Send a signed (or unsigned) request with retry + exponential backoff.
        """
        params = dict(params or {})
        if signed:
            params.setdefault("recvWindow", RECV_WINDOW)
            params = sign_params(params, self.api_secret)

        url = f"{self.base_url}{path}"
        backoff = 1

        for attempt in range(1, max_retries + 1):
            self._throttle()
            self._last_request_ts = time.time()

            try:
                resp = self._session.request(method, url, params=params)
            except requests.RequestException as exc:
                logger.warning("Request error (attempt %d): %s", attempt, exc)
                if attempt == max_retries:
                    raise
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)
                continue

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", backoff))
                logger.warning(
                    "Rate-limited (429). Sleeping %ds (attempt %d)",
                    retry_after, attempt,
                )
                time.sleep(retry_after)
                backoff = min(backoff * 2, 60)
                continue

            if resp.status_code == 418:
                # IP ban -- back off heavily
                logger.error("IP banned (418). Sleeping 120s.")
                time.sleep(120)
                continue

            if resp.status_code >= 400:
                logger.error(
                    "Binance error %d on %s: %s",
                    resp.status_code, path, resp.text,
                )
                resp.raise_for_status()

            return resp.json()

        raise RuntimeError(f"Max retries exceeded for {path}")

    # ======================================================================
    # 1. Account Balances
    # ======================================================================

    def get_balances(self) -> List[Dict[str, Any]]:
        """Return non-zero balances from GET /api/v3/account."""
        data = self._request("GET", "/api/v3/account", {"omitZeroBalances": "true"})
        balances = []
        for b in data.get("balances", []):
            free = float(b["free"])
            locked = float(b["locked"])
            total = free + locked
            if total > 0:
                balances.append({
                    "asset": b["asset"],
                    "free": free,
                    "locked": locked,
                    "total": total,
                })
        logger.info("Fetched %d non-zero balances", len(balances))
        return balances

    # ======================================================================
    # 2. Spot Trades  (fromId pagination, per-symbol)
    # ======================================================================

    def _get_trades_for_symbol(
        self,
        symbol: str,
        start_dt: datetime | None = None,
        end_dt: datetime | None = None,
    ) -> List[dict]:
        """Fetch ALL trades for a single symbol using fromId pagination."""
        all_trades: list[dict] = []
        from_id: int | None = None
        limit = 1000

        while True:
            params: dict[str, Any] = {"symbol": symbol, "limit": limit}
            if from_id is not None:
                params["fromId"] = from_id

            try:
                batch = self._request("GET", "/api/v3/myTrades", params)
            except requests.HTTPError:
                # Symbol may not exist (delisted). Skip gracefully.
                logger.debug("No trades for %s (possibly delisted)", symbol)
                break

            if not batch:
                break

            # Filter by date range if specified
            for t in batch:
                trade_time = int(t["time"])
                if start_dt and trade_time < _ms(start_dt):
                    continue
                if end_dt and trade_time > _ms(end_dt):
                    continue
                all_trades.append(t)

            # Paginate: next batch starts after the last trade id
            from_id = batch[-1]["id"] + 1

            if len(batch) < limit:
                break

        return all_trades

    def get_spot_trades(
        self,
        symbols: List[str],
        start_dt: datetime | None = None,
        end_dt: datetime | None = None,
    ) -> List[Dict[str, Any]]:
        """Normalised spot trade records for a list of validated symbols."""
        results: list[dict] = []
        for symbol in symbols:
            logger.info("Fetching trades for %s ...", symbol)
            raw_trades = self._get_trades_for_symbol(symbol, start_dt, end_dt)

            for t in raw_trades:
                # Determine base/quote assets from the symbol
                # The symbol is something like BTCUSDT; we can split using
                # the known quote asset at the end.
                base_asset, quote_asset = self._split_symbol(symbol)
                is_buyer = t["isBuyer"]

                results.append({
                    "id": _uuid(),
                    "datetime": _iso(t["time"]),
                    "type": "BUY" if is_buyer else "SELL",
                    "asset": base_asset,
                    "amount": float(t["qty"]),
                    "fee": float(t["commission"]),
                    "fee_asset": t["commissionAsset"],
                    "price": float(t["price"]),
                    "quote_amount": float(t["quoteQty"]),
                    "counter_asset": quote_asset,
                    "source_wallet": "binance_spot",
                    "dest_wallet": "binance_spot",
                    "source_endpoint": "spot_trade",
                    "exchange": self.EXCHANGE,
                    "external_id": str(t["id"]),
                    "order_id": str(t["orderId"]),
                    "status": "COMPLETED",
                    "raw_json": json.dumps(t),
                    "created_at": _now_iso(),
                    "updated_at": _now_iso(),
                })

            logger.info("  -> %d trades for %s", len(raw_trades), symbol)

        return results

    # ======================================================================
    # 3. Deposits  (90-day chunks + offset)
    # ======================================================================

    def get_deposits(
        self,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Dict[str, Any]]:
        results: list[dict] = []
        for chunk_start, chunk_end in self._90day_chunks(start_dt, end_dt):
            offset = 0
            limit = 1000
            while True:
                params = {
                    "startTime": _ms(chunk_start),
                    "endTime": _ms(chunk_end),
                    "offset": offset,
                    "limit": limit,
                    "includeSource": "true",
                }
                batch = self._request("GET", "/sapi/v1/capital/deposit/hisrec", params)
                if not batch:
                    break
                for d in batch:
                    results.append(self._normalize_deposit(d))
                offset += limit
                if len(batch) < limit:
                    break

        logger.info("Fetched %d deposits", len(results))
        return results

    def _normalize_deposit(self, d: dict) -> dict:
        return {
            "id": _uuid(),
            "datetime": _iso(d["insertTime"]),
            "type": "DEPOSIT",
            "asset": d["coin"],
            "amount": float(d["amount"]),
            "fee": 0.0,
            "fee_asset": d["coin"],
            "txhash": d.get("txId"),
            "network": d.get("network"),
            "address": d.get("address"),
            "source_wallet": f"external_{d.get('sourceAddress', 'unknown')}",
            "dest_wallet": "binance_spot",
            "transfer_type": d.get("transferType", 0),
            "source_endpoint": "deposit",
            "exchange": self.EXCHANGE,
            "external_id": str(d.get("id", "")),
            "status": self._deposit_status(d.get("status")),
            "raw_json": json.dumps(d),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }

    @staticmethod
    def _deposit_status(code: int | None) -> str:
        mapping = {0: "PENDING", 1: "SUCCESS", 6: "CREDITED", 7: "WRONG", 8: "CONFIRMING"}
        return mapping.get(code, "UNKNOWN")

    # ======================================================================
    # 4. Withdrawals  (90-day chunks + offset)
    # ======================================================================

    def get_withdrawals(
        self,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Dict[str, Any]]:
        results: list[dict] = []
        for chunk_start, chunk_end in self._90day_chunks(start_dt, end_dt):
            offset = 0
            limit = 1000
            while True:
                params = {
                    "startTime": _ms(chunk_start),
                    "endTime": _ms(chunk_end),
                    "offset": offset,
                    "limit": limit,
                }
                batch = self._request("GET", "/sapi/v1/capital/withdraw/history", params)
                if not batch:
                    break
                for w in batch:
                    results.append(self._normalize_withdrawal(w))
                offset += limit
                if len(batch) < limit:
                    break

        logger.info("Fetched %d withdrawals", len(results))
        return results

    def _normalize_withdrawal(self, w: dict) -> dict:
        return {
            "id": _uuid(),
            "datetime": _iso(
                w.get("completeTime")
                or w.get("applyTime")
                or 0
            ) if isinstance(w.get("completeTime"), (int, float)) else self._parse_withdrawal_time(w),
            "type": "WITHDRAWAL",
            "asset": w["coin"],
            "amount": float(w["amount"]),
            "fee": float(w.get("transactionFee", 0)),
            "fee_asset": w["coin"],
            "txhash": w.get("txId"),
            "network": w.get("network"),
            "address": w.get("address"),
            "source_wallet": "binance_spot",
            "dest_wallet": f"external_{w.get('address', 'unknown')}",
            "transfer_type": w.get("transferType", 0),
            "source_endpoint": "withdrawal",
            "exchange": self.EXCHANGE,
            "external_id": str(w.get("id", "")),
            "status": self._withdrawal_status(w.get("status")),
            "raw_json": json.dumps(w),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }

    def _parse_withdrawal_time(self, w: dict) -> str:
        """Withdrawal times can be epoch-ms ints or date strings."""
        for field in ("completeTime", "applyTime"):
            val = w.get(field)
            if val is None:
                continue
            if isinstance(val, (int, float)):
                return _iso(val)
            # Binance sometimes returns "2019-10-12 11:12:02" strings
            try:
                dt = datetime.strptime(str(val), "%Y-%m-%d %H:%M:%S")
                return dt.replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass
        return _now_iso()

    @staticmethod
    def _withdrawal_status(code: int | None) -> str:
        mapping = {
            0: "EMAIL_SENT", 2: "AWAITING", 3: "REJECTED",
            4: "PROCESSING", 6: "COMPLETED",
        }
        return mapping.get(code, "UNKNOWN")

    # ======================================================================
    # 5. P2P / C2C Trades  (page-based, both BUY and SELL)
    # ======================================================================

    def get_p2p_trades(
        self,
        start_dt: datetime | None = None,
        end_dt: datetime | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetch P2P/C2C trades using 30-day chunked windows.

        Binance C2C API constraints (from official docs):
          - Max interval between startTimestamp and endTimestamp is 30 days
          - Without timestamps, only the recent 30 days are returned
          - Only 6 months of history is available
          - Param names are startTimestamp/endTimestamp (NOT startTime/endTime)
        """
        results: list[dict] = []

        if not start_dt or not end_dt:
            start_dt = datetime.now(timezone.utc) - timedelta(days=180)
            end_dt = datetime.now(timezone.utc)

        for trade_type in ("BUY", "SELL"):
            type_count = 0
            for chunk_start, chunk_end in self._30day_chunks(start_dt, end_dt):
                page = 1
                while True:
                    params = {
                        "tradeType": trade_type,
                        "startTimestamp": _ms(chunk_start),
                        "endTimestamp": _ms(chunk_end),
                        "page": page,
                        "rows": 100,
                    }
                    resp = self._request(
                        "GET",
                        "/sapi/v1/c2c/orderMatch/listUserOrderHistory",
                        params,
                    )

                    if page == 1 and chunk_start == start_dt:
                        logger.info(
                            "C2C %s response: code=%s, total=%s",
                            trade_type,
                            resp.get("code", "N/A") if isinstance(resp, dict) else "N/A",
                            resp.get("total", "N/A") if isinstance(resp, dict) else "N/A",
                        )

                    orders = resp.get("data", [])
                    if not orders:
                        break

                    for o in orders:
                        results.append(self._normalize_p2p(o, trade_type))
                        type_count += 1

                    if len(orders) < 100:
                        break
                    page += 1

            logger.info("C2C %s: %d trades fetched", trade_type, type_count)

        logger.info("Fetched %d P2P trades total", len(results))
        return results

    def _normalize_p2p(self, o: dict, trade_type: str) -> dict:
        txn_type = "P2P_BUY" if trade_type == "BUY" else "P2P_SELL"
        return {
            "id": _uuid(),
            "datetime": _iso(o["createTime"]),
            "type": txn_type,
            "asset": o["asset"],
            "amount": float(o["amount"]),
            "fee": float(o.get("commission", 0)),
            "fee_asset": o.get("fiat", "INR"),
            "price": float(o.get("unitPrice", 0)),
            "quote_amount": float(o.get("totalPrice", 0)),
            "counter_asset": o.get("fiat", "INR"),
            "source_wallet": "binance_p2p" if trade_type == "BUY" else "binance_spot",
            "dest_wallet": "binance_spot" if trade_type == "BUY" else "binance_p2p",
            "source_endpoint": "c2c",
            "exchange": self.EXCHANGE,
            "external_id": str(o.get("orderNumber", "")),
            "order_id": str(o.get("advNo", "")),
            "status": o.get("orderStatus", "UNKNOWN"),
            "raw_json": json.dumps(o),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }

    # ======================================================================
    # 6. Fiat Orders  (page-based, both deposit and withdraw)
    # ======================================================================

    def get_fiat_orders(
        self,
        start_dt: datetime | None = None,
        end_dt: datetime | None = None,
    ) -> List[Dict[str, Any]]:
        results: list[dict] = []
        # transactionType 0 = deposit (fiat buy), 1 = withdraw (fiat sell)
        for txn_type_code in (0, 1):
            page = 1
            while True:
                params = {
                    "transactionType": txn_type_code,
                    "page": page,
                    "rows": 500,
                }
                resp = self._request("GET", "/sapi/v1/fiat/orders", params)
                orders = resp.get("data", [])
                if not orders:
                    break
                for o in orders:
                    ts = o.get("createTime")
                    if ts:
                        ts = int(ts)
                        if start_dt and ts < _ms(start_dt):
                            continue
                        if end_dt and ts > _ms(end_dt):
                            continue
                    results.append(self._normalize_fiat(o, txn_type_code))
                if len(orders) < 500:
                    break
                page += 1

        logger.info("Fetched %d fiat orders", len(results))
        return results

    def _normalize_fiat(self, o: dict, txn_type_code: int) -> dict:
        txn_type = "FIAT_BUY" if txn_type_code == 0 else "FIAT_SELL"
        return {
            "id": _uuid(),
            "datetime": _iso(o.get("createTime", 0)),
            "type": txn_type,
            "asset": o.get("fiatCurrency", "INR"),
            "amount": float(o.get("amount", 0)),
            "fee": float(o.get("totalFee", 0)),
            "fee_asset": o.get("fiatCurrency", "INR"),
            "price": float(o.get("price", 0)),
            "quote_amount": float(o.get("amount", 0)),
            "counter_asset": o.get("fiatCurrency", "INR"),
            "source_endpoint": "fiat_order",
            "exchange": self.EXCHANGE,
            "external_id": str(o.get("orderNo", "")),
            "status": o.get("status", "UNKNOWN"),
            "raw_json": json.dumps(o),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }

    # ======================================================================
    # 7. Dust Conversions  (90-day chunks)
    # ======================================================================

    def get_dust_conversions(
        self,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Dict[str, Any]]:
        results: list[dict] = []
        for chunk_start, chunk_end in self._90day_chunks(start_dt, end_dt):
            params = {
                "startTime": _ms(chunk_start),
                "endTime": _ms(chunk_end),
            }
            try:
                resp = self._request("GET", "/sapi/v1/asset/dribblet", params)
            except requests.HTTPError:
                continue

            dribblets = resp.get("userAssetDribblets", [])
            for group in dribblets:
                operate_time = group.get("operateTime", 0)
                details = group.get("userAssetDribbletDetails", [])
                for detail in details:
                    from_asset = detail.get("fromAsset", "")
                    trans_id = str(detail.get("transId", ""))
                    results.append({
                        "id": _uuid(),
                        "datetime": _iso(operate_time),
                        "type": "DUST_CONVERSION",
                        "asset": from_asset,
                        "amount": float(detail.get("amount", 0)),
                        "fee": float(detail.get("serviceChargeAmount", 0)),
                        "fee_asset": "BNB",
                        "price": 0.0,
                        "quote_amount": float(detail.get("transferedAmount", 0)),
                        "counter_asset": "BNB",
                        "source_wallet": "binance_spot",
                        "dest_wallet": "binance_spot",
                        "source_endpoint": "dust",
                        "exchange": self.EXCHANGE,
                        "external_id": f"{trans_id}_{from_asset}",
                        "status": "COMPLETED",
                        "raw_json": json.dumps(detail),
                        "created_at": _now_iso(),
                        "updated_at": _now_iso(),
                    })

        logger.info("Fetched %d dust conversions", len(results))
        return results

    # ======================================================================
    # 8. Convert Trade Flow  (30-day chunks)
    # ======================================================================

    def get_convert_trades(
        self,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Dict[str, Any]]:
        results: list[dict] = []
        for chunk_start, chunk_end in self._30day_chunks(start_dt, end_dt):
            params = {
                "startTime": _ms(chunk_start),
                "endTime": _ms(chunk_end),
                "limit": 1000,
            }
            try:
                resp = self._request("GET", "/sapi/v1/convert/tradeFlow", params)
            except requests.HTTPError:
                continue

            trades = resp.get("list", [])
            for t in trades:
                results.append(self._normalize_convert(t))

            # If we got exactly limit, there may be more -- but the convert
            # endpoint does not have a clear cursor, so we rely on the
            # 30-day windows being small enough.

        logger.info("Fetched %d convert trades", len(results))
        return results

    def _normalize_convert(self, t: dict) -> dict:
        return {
            "id": _uuid(),
            "datetime": _iso(t.get("createTime", 0)),
            "type": "CONVERT",
            "asset": t.get("toAsset", ""),
            "amount": float(t.get("toAmount", 0)),
            "fee": 0.0,
            "fee_asset": None,
            "price": float(t.get("ratio", 0)),
            "quote_amount": float(t.get("fromAmount", 0)),
            "counter_asset": t.get("fromAsset", ""),
            "source_wallet": "binance_convert",
            "dest_wallet": "binance_spot",
            "source_endpoint": "convert",
            "exchange": self.EXCHANGE,
            "external_id": str(t.get("orderId", "")),
            "order_id": str(t.get("quoteId", "")),
            "status": t.get("orderStatus", "UNKNOWN"),
            "raw_json": json.dumps(t),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }

    # ======================================================================
    # Symbol Discovery Pipeline
    # ======================================================================

    def discover_symbols(
        self,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[str]:
        """
        Build the list of valid trading-pair symbols to query myTrades for.

        Pipeline:
          1. balances -> coin names
          2. deposits -> coin names
          3. withdrawals -> coin names
          4. convert trades -> fromAsset + toAsset
          5. dust conversions -> fromAsset
          6. union with MANUAL_COINS
          7. cross with QUOTE_ASSETS -> candidate symbols
          8. validate against exchangeInfo
        """
        coins: Set[str] = set()

        # Step 1: current balances
        logger.info("Symbol discovery: fetching balances ...")
        try:
            for b in self.get_balances():
                coins.add(b["asset"])
        except Exception as exc:
            logger.warning("Could not fetch balances for symbol discovery: %s", exc)

        # Steps 2-3: deposits/withdrawals skipped — imported via Excel
        # (API retention: 90 days only)

        # Step 4: convert trades
        logger.info("Symbol discovery: scanning convert trades ...")
        try:
            for ct in self.get_convert_trades(start_dt, end_dt):
                coins.add(ct["asset"])
                if ct.get("counter_asset"):
                    coins.add(ct["counter_asset"])
        except Exception as exc:
            logger.warning("Convert scan failed: %s", exc)

        # Step 5: dust
        logger.info("Symbol discovery: scanning dust conversions ...")
        try:
            for d in self.get_dust_conversions(start_dt, end_dt):
                coins.add(d["asset"])
        except Exception as exc:
            logger.warning("Dust scan failed: %s", exc)

        # Step 6: manual coins
        coins.update(MANUAL_COINS)

        # Remove quote assets from the coin set (they are counters, not bases
        # that we need to query independently)
        coins -= {"USDT", "BUSD", "FDUSD", "USDC", "BTC", "BNB", "ETH", "INR"}
        # But keep BNB/ETH/BTC as base coins since they can be traded
        coins.update({"BNB", "ETH", "BTC"})

        # Step 7: cross-product with quote assets
        candidates = [f"{coin}{quote}" for coin in coins for quote in QUOTE_ASSETS]

        # Step 8: validate against exchangeInfo
        valid_symbols = self._get_valid_symbols()
        result = [s for s in candidates if s in valid_symbols]

        logger.info(
            "Symbol discovery: %d coins found -> %d candidate pairs -> %d valid",
            len(coins), len(candidates), len(result),
        )
        return sorted(set(result))

    def _get_valid_symbols(self) -> Set[str]:
        """Fetch all valid symbols from GET /api/v3/exchangeInfo."""
        data = self._request("GET", "/api/v3/exchangeInfo", signed=False)
        return {s["symbol"] for s in data.get("symbols", [])}

    # ======================================================================
    # Full sync orchestrator
    # ======================================================================

    def sync_all(
        self,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Dict[str, Any]]:
        """
        Run the full extraction pipeline for a date range and return
        normalised transaction dicts ready for DB insertion.
        """
        all_txns: list[dict] = []

        # Deposits, withdrawals, and C2C/P2P are imported via Excel
        # (Binance Data Download Center) due to API retention limits:
        #   - Deposits/Withdrawals: 90 days
        #   - C2C/P2P: 6 months

        # -- Fiat orders ----------------------------------------------------
        logger.info("=== Phase 1: Fiat Orders ===")
        fiat = self.get_fiat_orders(start_dt, end_dt)
        all_txns.extend(fiat)

        # -- Dust conversions -----------------------------------------------
        logger.info("=== Phase 2: Dust Conversions ===")
        dust = self.get_dust_conversions(start_dt, end_dt)
        all_txns.extend(dust)

        # -- Convert trades -------------------------------------------------
        logger.info("=== Phase 3: Convert Trades ===")
        convert = self.get_convert_trades(start_dt, end_dt)
        all_txns.extend(convert)

        # -- Symbol discovery + spot trades ---------------------------------
        logger.info("=== Phase 7: Symbol Discovery ===")
        symbols = self.discover_symbols(start_dt, end_dt)

        logger.info("=== Phase 8: Spot Trades (%d symbols) ===", len(symbols))
        spot = self.get_spot_trades(symbols, start_dt, end_dt)
        all_txns.extend(spot)

        logger.info(
            "=== Sync complete: %d total transactions ===", len(all_txns),
        )
        return all_txns

    # ======================================================================
    # Internal utilities
    # ======================================================================

    def _split_symbol(self, symbol: str) -> tuple[str, str]:
        """
        Split 'BTCUSDT' into ('BTC', 'USDT') using known quote assets.
        Tries longest match first to handle e.g. FDUSD before USD.
        """
        for quote in sorted(QUOTE_ASSETS, key=len, reverse=True):
            if symbol.endswith(quote):
                base = symbol[: -len(quote)]
                if base:
                    return base, quote
        # Fallback: assume last 4 chars are quote
        return symbol[:-4], symbol[-4:]

    @staticmethod
    def _90day_chunks(
        start_dt: datetime, end_dt: datetime,
    ) -> list[tuple[datetime, datetime]]:
        """Split a range into 89-day sub-ranges (Binance 90-day max)."""
        chunks: list[tuple[datetime, datetime]] = []
        cursor = start_dt
        while cursor < end_dt:
            chunk_end = min(cursor + timedelta(days=89), end_dt)
            chunks.append((cursor, chunk_end))
            cursor = chunk_end + timedelta(milliseconds=1)
        return chunks

    @staticmethod
    def _30day_chunks(
        start_dt: datetime, end_dt: datetime,
    ) -> list[tuple[datetime, datetime]]:
        """Split a range into 29-day sub-ranges (Convert endpoint 30-day max)."""
        chunks: list[tuple[datetime, datetime]] = []
        cursor = start_dt
        while cursor < end_dt:
            chunk_end = min(cursor + timedelta(days=29), end_dt)
            chunks.append((cursor, chunk_end))
            cursor = chunk_end + timedelta(milliseconds=1)
        return chunks
