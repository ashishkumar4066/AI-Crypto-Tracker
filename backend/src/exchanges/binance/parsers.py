"""
Binance Excel export parsers.

Supports all Binance Data Download Center export types:
  - C2C Order History
  - Deposit History
  - Withdraw History
  - Spot Trade History
  - Spot Order History
  - Convert Order History
  - Transaction History (master ledger)
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Helpers (shared with import_routes._process_one_file)
# ---------------------------------------------------------------------------

def _uuid() -> str:
    return uuid.uuid4().hex


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(val: Any) -> str:
    if not val:
        return _now_iso()
    s = str(val).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return _now_iso()


def _float(val: Any) -> float:
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


_NUM_UNIT_RE = re.compile(r"^([\d.]+)\s*([A-Za-z]+)$")


def _split_amount_unit(val: Any) -> tuple[float, str]:
    """Parse '82.9USUAL' or '72.123USDT' into (82.9, 'USUAL')."""
    if val is None:
        return 0.0, ""
    s = str(val).strip()
    m = _NUM_UNIT_RE.match(s)
    if m:
        return float(m.group(1)), m.group(2).upper()
    try:
        return float(s), ""
    except ValueError:
        return 0.0, s


def _col_map(headers: list[str]) -> dict[str, int]:
    """Build header_name -> column_index map, skipping empty headers."""
    result = {}
    for i, h in enumerate(headers):
        if h:
            clean = re.sub(r"[^ -~]", "", h).strip()
            if clean in result:
                clean = f"{clean}_{i}"
            result[clean] = i
    return result


def _cell(row: list, col: dict, name: str, default: Any = "") -> Any:
    idx = col.get(name)
    if idx is None or idx >= len(row):
        return default
    return row[idx] if row[idx] is not None else default


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def _parse_c2c(headers: list[str], rows: list[list]) -> list[dict]:
    col = _col_map(headers)
    txns = []
    for row in rows:
        status = str(_cell(row, col, "Status")).strip()
        if status != "Completed":
            continue
        order_type = str(_cell(row, col, "Order Type")).strip().lower()
        is_buy = order_type == "buy"
        maker_fee = _float(_cell(row, col, "Maker Fee", 0))
        taker_fee = _float(_cell(row, col, "Taker Fee", 0))
        txns.append({
            "id": _uuid(),
            "datetime": _parse_dt(_cell(row, col, "Created Time")),
            "type": "P2P_BUY" if is_buy else "P2P_SELL",
            "asset": str(_cell(row, col, "Asset")).strip(),
            "amount": _float(_cell(row, col, "Quantity")),
            "fee": maker_fee + taker_fee,
            "fee_asset": str(_cell(row, col, "Fiat Type", "INR")).strip(),
            "price": _float(_cell(row, col, "Price")),
            "quote_amount": _float(_cell(row, col, "Total Price")),
            "counter_asset": str(_cell(row, col, "Fiat Type", "INR")).strip(),
            "source_wallet": "binance_p2p" if is_buy else "binance_spot",
            "dest_wallet": "binance_spot" if is_buy else "binance_p2p",
            "source_endpoint": "excel_c2c",
            "exchange": "binance",
            "external_id": str(_cell(row, col, "Order Number")),
            "status": status,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    return txns


def _parse_deposits(headers: list[str], rows: list[list]) -> list[dict]:
    col = _col_map(headers)
    txns = []
    for row in rows:
        txid = str(_cell(row, col, "TXID")).strip()
        if not txid:
            continue
        coin = str(_cell(row, col, "Coin")).strip()
        txns.append({
            "id": _uuid(),
            "datetime": _parse_dt(_cell(row, col, "Time")),
            "type": "DEPOSIT",
            "asset": coin,
            "amount": _float(_cell(row, col, "Amount")),
            "fee": 0.0,
            "fee_asset": coin,
            "network": str(_cell(row, col, "Network")).strip(),
            "address": str(_cell(row, col, "Address")).strip(),
            "txhash": txid,
            "source_wallet": "external",
            "dest_wallet": "binance_spot",
            "source_endpoint": "excel_deposit",
            "exchange": "binance",
            "external_id": txid,
            "status": str(_cell(row, col, "Status")).strip(),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    return txns


def _parse_withdrawals(headers: list[str], rows: list[list]) -> list[dict]:
    col = _col_map(headers)
    txns = []
    for row in rows:
        txid = str(_cell(row, col, "TXID")).strip()
        if not txid:
            continue
        coin = str(_cell(row, col, "Coin")).strip()
        addr = str(_cell(row, col, "Address")).strip()
        txns.append({
            "id": _uuid(),
            "datetime": _parse_dt(_cell(row, col, "Time")),
            "type": "WITHDRAWAL",
            "asset": coin,
            "amount": _float(_cell(row, col, "Amount")),
            "fee": _float(_cell(row, col, "Fee")),
            "fee_asset": coin,
            "network": str(_cell(row, col, "Network")).strip(),
            "address": addr,
            "txhash": txid,
            "source_wallet": "binance_spot",
            "dest_wallet": f"external_{addr[:8]}" if addr else "external",
            "source_endpoint": "excel_withdrawal",
            "exchange": "binance",
            "external_id": txid,
            "status": str(_cell(row, col, "Status")).strip(),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    return txns


def _parse_spot_trades(headers: list[str], rows: list[list]) -> list[dict]:
    """
    Spot Trade History.
    Headers: Time | Pair | Side | Price | Executed | Amount | Fee
    Values have embedded units: '82.9USUAL', '72.123USDT', '0.0829USUAL'
    """
    col = _col_map(headers)
    txns = []
    for row in rows:
        pair = str(_cell(row, col, "Pair")).strip()
        side = str(_cell(row, col, "Side")).strip().upper()
        price = _float(_cell(row, col, "Price"))
        exec_amt, exec_unit = _split_amount_unit(_cell(row, col, "Executed"))
        total_amt, total_unit = _split_amount_unit(_cell(row, col, "Amount"))
        fee_amt, fee_unit = _split_amount_unit(_cell(row, col, "Fee"))

        if exec_amt == 0:
            continue

        # Base asset = executed unit, quote asset = amount unit
        base_asset = exec_unit or pair.replace(total_unit, "") if total_unit else ""
        quote_asset = total_unit or ""

        txns.append({
            "id": _uuid(),
            "datetime": _parse_dt(_cell(row, col, "Time")),
            "type": "BUY" if side == "BUY" else "SELL",
            "asset": base_asset,
            "amount": exec_amt,
            "fee": fee_amt,
            "fee_asset": fee_unit,
            "price": price,
            "quote_amount": total_amt,
            "counter_asset": quote_asset,
            "source_wallet": "binance_spot",
            "dest_wallet": "binance_spot",
            "source_endpoint": "excel_spot_trade",
            "exchange": "binance",
            "external_id": f"{pair}_{_cell(row, col, 'Time')}_{exec_amt}",
            "status": "COMPLETED",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    return txns


def _parse_spot_orders(headers: list[str], rows: list[list]) -> list[dict]:
    """
    Spot Order History.
    Headers: Time | OrderNo | Pair | Type | Side | Order Price | Order Amount |
             Time | Executed | Average Price | Trading total | Status
    """
    col = _col_map(headers)
    txns = []
    for row in rows:
        status = str(_cell(row, col, "Status")).strip().upper()
        if status not in ("FILLED", "PARTIALLY_FILLED"):
            continue

        pair = str(_cell(row, col, "Pair")).strip()
        side = str(_cell(row, col, "Side")).strip().upper()
        avg_price = _float(_cell(row, col, "Average Price"))

        # Headers may have invisible BOM chars -- find fuzzy match
        exec_key = next((k for k in col if k.startswith("Executed")), "Executed")
        total_key = next((k for k in col if k.startswith("Trading total")), "Trading total")

        exec_amt, exec_unit = _split_amount_unit(_cell(row, col, exec_key))
        total_amt, total_unit = _split_amount_unit(_cell(row, col, total_key))
        order_no = str(_cell(row, col, "OrderNo")).strip()

        if exec_amt == 0:
            continue

        base_asset = exec_unit or ""
        quote_asset = total_unit or ""

        txns.append({
            "id": _uuid(),
            "datetime": _parse_dt(_cell(row, col, "Time")),
            "type": "BUY" if side == "BUY" else "SELL",
            "asset": base_asset,
            "amount": exec_amt,
            "fee": 0.0,
            "fee_asset": "",
            "price": avg_price,
            "quote_amount": total_amt,
            "counter_asset": quote_asset,
            "source_wallet": "binance_spot",
            "dest_wallet": "binance_spot",
            "source_endpoint": "excel_spot_order",
            "exchange": "binance",
            "external_id": order_no,
            "order_id": order_no,
            "status": status,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    return txns


def _parse_convert(headers: list[str], rows: list[list]) -> list[dict]:
    """
    Convert Order History.
    Actual format: Time | Wallet | Pair | Type | Sell | Buy | Price | Inverse Price | Date Updated | Status
    Sell/Buy have embedded units: '203.85385652 POL', '19.82587663 USDT'
    """
    col = _col_map(headers)
    txns = []
    for row in rows:
        status = str(_cell(row, col, "Status")).strip()
        if status not in ("Successful", "Filled", "Completed", "SUCCESS", "Success"):
            continue

        sell_val = str(_cell(row, col, "Sell")).strip()
        buy_val = str(_cell(row, col, "Buy")).strip()

        sell_amt, sell_asset = _split_amount_unit(sell_val)
        buy_amt, buy_asset = _split_amount_unit(buy_val)

        if sell_amt == 0 and buy_amt == 0:
            continue

        time_str = str(_cell(row, col, "Time")).strip()

        txns.append({
            "id": _uuid(),
            "datetime": _parse_dt(time_str),
            "type": "CONVERT",
            "asset": buy_asset,
            "amount": buy_amt,
            "fee": 0.0,
            "fee_asset": "",
            "price": sell_amt / buy_amt if buy_amt > 0 else 0.0,
            "quote_amount": sell_amt,
            "counter_asset": sell_asset,
            "source_wallet": "binance_convert",
            "dest_wallet": "binance_spot",
            "source_endpoint": "excel_convert",
            "exchange": "binance",
            "external_id": f"convert_{time_str}_{sell_asset}_{buy_asset}_{sell_amt}",
            "status": status,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    return txns


def _parse_transaction_history(headers: list[str], rows: list[list]) -> list[dict]:
    """
    Transaction History -- the master ledger export from Binance.
    Headers: User ID | Time | Account | Operation | Coin | Change | Remark

    Operation types map to transaction types:
      Transaction Buy / Transaction Spend / Transaction Sold / Transaction Fee
      P2P Trading, Deposit, Withdraw, Binance Convert,
      Small Assets Exchange BNB, Distribution, Airdrop Assets,
      Transfer Between Spot and Funding, etc.
    """
    col = _col_map(headers)
    txns = []

    _OP_TYPE_MAP = {
        "Transaction Buy": "BUY",
        "Transaction Spend": "SELL",
        "Transaction Sold": "SELL",
        "Transaction Fee": "FEE",
        "Transaction Revenue": "REWARD",
        "P2P Trading": "P2P_BUY",
        "Deposit": "DEPOSIT",
        "Withdraw": "WITHDRAWAL",
        "Binance Convert": "CONVERT",
        "Small Assets Exchange BNB": "DUST_CONVERSION",
        "Distribution": "REWARD",
        "Airdrop Assets": "REWARD",
        "Launchpool Airdrop - User Claim Distribution": "REWARD",
        "Launchpool Subscription/Redemption": "STAKING",
        "Commission Rebate": "REWARD",
        "Crypto Box": "REWARD",
        "Token Swap - Distribution": "CONVERT",
        "Token Swap - Redenomination/Rebranding": "CONVERT",
        "Simple Earn Flexible Subscription": "STAKING",
        "Simple Earn Flexible Redemption": "STAKING",
        "Transfer Between Spot and Funding": "INTERNAL_TRANSFER",
        "Transfer Between Spot and UM Futures": "INTERNAL_TRANSFER",
        "Asset Recovery": "REWARD",
        "Fee": "FEE",
        "Funding Fee": "FEE",
        "Realized Profit and Loss": "REWARD",
    }

    for row in rows:
        operation = str(_cell(row, col, "Operation")).strip()
        if not operation:
            continue

        coin = str(_cell(row, col, "Coin")).strip()
        change_val = _float(_cell(row, col, "Change"))
        account = str(_cell(row, col, "Account")).strip()
        remark = str(_cell(row, col, "Remark")).strip()
        time_str = str(_cell(row, col, "Time")).strip()

        txn_type = _OP_TYPE_MAP.get(operation, "UNKNOWN")

        # P2P Trading: positive change = buy, negative = sell
        if operation == "P2P Trading":
            txn_type = "P2P_BUY" if change_val >= 0 else "P2P_SELL"

        # Determine wallet based on account
        wallet = "binance_spot"
        if account == "Funding":
            wallet = "binance_funding"
        elif account == "UM Futures":
            wallet = "binance_futures"

        src_wallet = wallet
        dst_wallet = wallet
        if txn_type == "DEPOSIT":
            src_wallet = "external"
            dst_wallet = wallet
        elif txn_type == "WITHDRAWAL":
            src_wallet = wallet
            dst_wallet = "external"
        elif txn_type == "INTERNAL_TRANSFER":
            if change_val > 0:
                src_wallet = "binance_funding"
                dst_wallet = "binance_spot"
            else:
                src_wallet = "binance_spot"
                dst_wallet = "binance_funding"

        # Build a unique external_id from time + operation + coin + change
        ext_id = f"txnhist_{time_str}_{operation}_{coin}_{change_val}"

        txns.append({
            "id": _uuid(),
            "datetime": _parse_dt(time_str),
            "type": txn_type,
            "asset": coin,
            "amount": abs(change_val),
            "fee": 0.0,
            "fee_asset": coin if txn_type == "FEE" else "",
            "price": 0.0,
            "quote_amount": 0.0,
            "counter_asset": "",
            "source_wallet": src_wallet,
            "dest_wallet": dst_wallet,
            "source_endpoint": "excel_transaction_history",
            "exchange": "binance",
            "external_id": ext_id,
            "status": "COMPLETED",
            "raw_json": remark if remark else None,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })

    return txns


# ---------------------------------------------------------------------------
# Type detection & parser routing
# ---------------------------------------------------------------------------

PARSERS = {
    "C2C": _parse_c2c,
    "Deposit": _parse_deposits,
    "Withdraw": _parse_withdrawals,
    "Spot Trade": _parse_spot_trades,
    "Spot Order": _parse_spot_orders,
    "Convert": _parse_convert,
    "Transaction": _parse_transaction_history,
}


def detect_type(row3_text: str) -> str | None:
    """Match row 3 label to a parser key."""
    for key in PARSERS:
        if key.lower().replace(" ", "") in row3_text.lower().replace(" ", ""):
            return key
    return None
