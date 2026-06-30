"""
GET /api/v1/flow/coin/{asset}  — deduplicated chronological journey of a coin
GET /api/v1/flow/coins         — list of all coins with summary stats
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.config import FY_DATE_RANGES
from src.db.database import get_db
from src.db.models import Transaction

router = APIRouter()

# Source priority for deduplication (lower = higher priority)
_SOURCE_PRIORITY = {
    "excel_transaction_history": 0,
    "excel_spot_trade": 1,
    "excel_c2c": 2,
    "excel_deposit": 3,
    "excel_withdrawal": 4,
    "excel_spot_order": 5,
    "excel_convert": 6,
}

# Types that increase balance (coins received)
_CREDIT_TYPES = {
    "BUY", "DEPOSIT", "P2P_BUY", "FIAT_BUY", "REWARD",
    "TOKEN_SWAP_IN", "CONVERT_IN", "DUST_IN",
    "EARN_UNLOCK", "STAKING_UNLOCK", "FUNDING_FEE_IN",
    "FUTURES_PNL",
}
# Types that decrease balance (coins spent/taken)
_DEBIT_TYPES = {
    "SELL", "WITHDRAWAL", "P2P_SELL", "FIAT_SELL", "FEE",
    "CONVERT", "DUST_CONVERSION",
    "TOKEN_SWAP_OUT", "CONVERT_OUT", "DUST_OUT",
    "EARN_LOCK", "STAKING_LOCK",
}

# Coin rebranding aliases
_COIN_ALIASES = {
    "MATIC": ["MATIC", "POL"],
    "POL": ["MATIC", "POL"],
    "AGIX": ["AGIX", "FET"],
    "OCEAN": ["OCEAN", "FET"],
}

# Block explorer URLs by network
_EXPLORER_URLS = {
    "BSC": "https://bscscan.com/tx/",
    "ETH": "https://etherscan.io/tx/",
    "MATIC": "https://polygonscan.com/tx/",
    "SOL": "https://solscan.io/tx/",
    "TRX": "https://tronscan.org/#/transaction/",
    "BNB": "https://bscscan.com/tx/",
    "NTRN": "https://www.mintscan.io/neutron/tx/",
}


def _get_coin_names(asset: str) -> list[str]:
    return _COIN_ALIASES.get(asset.upper(), [asset.upper()])


def _deduplicate(txns: list[Transaction], db) -> list[Transaction]:
    """
    Source-priority dedup: Transaction History is the single source of truth.
    Spot Trade/Order are only used for FYs where Transaction History is empty.
    Then enrich withdrawal/deposit records with txHash from dedicated Excel sources.
    """
    from datetime import datetime as dt
    from src.config import FY_DATE_RANGES

    # Step 1: Determine which FYs have Transaction History data
    fy_has_txn_hist = set()
    for t in txns:
        if t.source_endpoint == "excel_transaction_history" and t.datetime:
            for fy, (start, end) in FY_DATE_RANGES.items():
                if start.isoformat() <= t.datetime <= end.isoformat():
                    fy_has_txn_hist.add(fy)
                    break

    def _get_fy(datetime_str: str) -> str | None:
        if not datetime_str:
            return None
        for fy, (start, end) in FY_DATE_RANGES.items():
            if start.isoformat() <= datetime_str <= end.isoformat():
                return fy
        return None

    # Step 2: Filter — keep only the right source per FY
    filtered = []
    for t in txns:
        ep = t.source_endpoint or ""
        fy = _get_fy(t.datetime)

        if ep == "excel_transaction_history":
            filtered.append(t)
        elif ep == "excel_spot_trade":
            if fy and fy not in fy_has_txn_hist:
                filtered.append(t)
        elif ep == "excel_spot_order":
            pass  # never use — always a duplicate of spot_trade
        elif ep == "excel_c2c":
            if fy and fy not in fy_has_txn_hist:
                filtered.append(t)
        elif ep in ("excel_deposit", "excel_withdrawal"):
            pass  # used for enrichment only, not as primary events
        elif ep == "excel_convert":
            pass  # Transaction History already has convert events
        else:
            filtered.append(t)

    # Step 3: Enrich withdrawal/deposit records with txHash from dedicated sources
    dep_records = [t for t in txns if t.source_endpoint == "excel_deposit"]
    wth_records = [t for t in txns if t.source_endpoint == "excel_withdrawal"]

    for t in filtered:
        if t.type == "WITHDRAWAL" and not t.txhash:
            match = _find_enrichment_match(t, wth_records)
            if match:
                t.txhash = match.txhash
                t.network = match.network
                t.address = match.address
        elif t.type == "DEPOSIT" and not t.txhash:
            match = _find_enrichment_match(t, dep_records)
            if match:
                t.txhash = match.txhash
                t.network = match.network
                t.address = match.address

    return sorted(filtered, key=lambda t: t.datetime or "")


def _find_enrichment_match(
    primary: Transaction, candidates: list[Transaction]
) -> Transaction | None:
    """Find a matching record from deposit/withdrawal Excel by coin+time+amount."""
    from datetime import datetime as dt

    for c in candidates:
        if c.asset != primary.asset:
            continue
        try:
            t1 = dt.fromisoformat(primary.datetime) if primary.datetime else None
            t2 = dt.fromisoformat(c.datetime) if c.datetime else None
            if not t1 or not t2:
                continue
            if abs((t1 - t2).total_seconds()) > 180:
                continue
        except (ValueError, TypeError):
            continue

        amt1 = primary.amount or 0
        amt2 = c.amount or 0
        if amt2 > 0 and abs(amt1 - amt2) / amt2 <= 0.05:
            return c

    return None


def _match_transfers(events: list[dict]) -> list[dict]:
    """
    Match withdrawal → deposit pairs by txHash or amount+time.
    """
    withdrawals = [e for e in events if e["type"] == "WITHDRAWAL" and e.get("txhash")]
    deposits = [e for e in events if e["type"] == "DEPOSIT" and e.get("txhash")]

    transfers = []
    matched_dep_ids = set()

    for w in withdrawals:
        best_match = None
        best_confidence = 0

        for d in deposits:
            if d["id"] in matched_dep_ids:
                continue

            # Exact txHash match
            if w["txhash"] and d["txhash"] and w["txhash"] == d["txhash"]:
                best_match = d
                best_confidence = 100
                break

        # Fuzzy match: same amount ± 5%, deposit after withdrawal
        if not best_match:
            for d in deposits:
                if d["id"] in matched_dep_ids:
                    continue
                w_amt = w["amount"]
                d_amt = d["amount"]
                if w_amt > 0 and abs(d_amt - w_amt) / w_amt <= 0.05:
                    if d["datetime"] >= w["datetime"]:
                        best_match = d
                        best_confidence = 85
                        break

        if best_match:
            matched_dep_ids.add(best_match["id"])

            from datetime import datetime
            try:
                w_dt = datetime.fromisoformat(w["datetime"])
                d_dt = datetime.fromisoformat(best_match["datetime"])
                gap_days = (d_dt - w_dt).days
            except (ValueError, TypeError):
                gap_days = None

            transfers.append({
                "withdrawal": {
                    "datetime": w["datetime"],
                    "amount": w["amount"],
                    "txhash": w["txhash"],
                    "network": w.get("network"),
                    "address": w.get("address"),
                    "explorer_url": _EXPLORER_URLS.get(w.get("network", ""), "") + (w["txhash"] or ""),
                },
                "deposit": {
                    "datetime": best_match["datetime"],
                    "amount": best_match["amount"],
                    "txhash": best_match["txhash"],
                    "network": best_match.get("network"),
                    "address": best_match.get("address"),
                    "explorer_url": _EXPLORER_URLS.get(best_match.get("network", ""), "") + (best_match["txhash"] or ""),
                },
                "confidence": best_confidence,
                "on_chain_gap_days": gap_days,
            })

            # Mark events as matched
            w["matched_transfer"] = True
            best_match["matched_transfer"] = True

    return transfers


@router.get("/flow/coin/{asset}")
def coin_flow(
    asset: str,
    fy: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Deduplicated chronological journey of a coin with running balance."""
    coin_names = _get_coin_names(asset)

    q = db.query(Transaction).filter(Transaction.asset.in_(coin_names))

    if fy and fy in FY_DATE_RANGES:
        start_dt, end_dt = FY_DATE_RANGES[fy]
        q = q.filter(
            Transaction.datetime >= start_dt.isoformat(),
            Transaction.datetime <= end_dt.isoformat(),
        )

    raw_txns = q.order_by(Transaction.datetime).all()
    deduped = _deduplicate(raw_txns, db)

    # Build events with running balance
    events = []
    balance = 0.0
    total_bought = 0.0
    total_sold = 0.0
    total_fees = 0.0

    for txn in deduped:
        amount = txn.amount or 0
        txn_type = txn.type or "UNKNOWN"

        if txn_type in _CREDIT_TYPES:
            balance += amount
            total_bought += amount
        elif txn_type in _DEBIT_TYPES:
            balance -= amount
            if txn_type == "FEE":
                total_fees += amount
            else:
                total_sold += amount

        explorer_url = None
        if txn.txhash and txn.network:
            base = _EXPLORER_URLS.get(txn.network, "")
            if base:
                explorer_url = base + txn.txhash

        location = txn.source_wallet or "unknown"
        if txn_type == "WITHDRAWAL":
            location = f"{txn.source_wallet} → {txn.dest_wallet}"
        elif txn_type == "DEPOSIT":
            location = f"{txn.source_wallet} → {txn.dest_wallet}"

        events.append({
            "id": txn.id,
            "datetime": txn.datetime,
            "type": txn_type,
            "amount": amount,
            "price": txn.price,
            "counter_asset": txn.counter_asset,
            "quote_amount": txn.quote_amount,
            "fee": txn.fee,
            "fee_asset": txn.fee_asset,
            "balance_after": round(balance, 8),
            "location": location,
            "source_wallet": txn.source_wallet,
            "dest_wallet": txn.dest_wallet,
            "txhash": txn.txhash,
            "network": txn.network,
            "address": txn.address,
            "explorer_url": explorer_url,
            "source_endpoint": txn.source_endpoint,
            "matched_transfer": False,
        })

    # Match withdrawal → deposit pairs
    transfers = _match_transfers(events)

    return {
        "asset": asset.upper(),
        "aliases": coin_names,
        "total_events": len(events),
        "total_bought": round(total_bought, 8),
        "total_sold": round(total_sold, 8),
        "total_fees": round(total_fees, 8),
        "current_balance": round(balance, 8),
        "events": events,
        "transfers": transfers,
    }


@router.get("/flow/coins")
def coin_list(db: Session = Depends(get_db)):
    """List all coins with summary stats and current balance."""
    all_assets = set(
        r[0] for r in db.query(Transaction.asset).distinct().all() if r[0]
    )

    dep_coins = set(
        r[0] for r in db.query(Transaction.asset)
        .filter(Transaction.type == "DEPOSIT").distinct().all()
    )
    wth_coins = set(
        r[0] for r in db.query(Transaction.asset)
        .filter(Transaction.type == "WITHDRAWAL").distinct().all()
    )

    type_counts = defaultdict(lambda: defaultdict(int))
    type_rows = db.query(
        Transaction.asset, Transaction.type, func.count(Transaction.id)
    ).group_by(Transaction.asset, Transaction.type).all()
    for asset, typ, cnt in type_rows:
        type_counts[asset][typ] = cnt

    event_counts = {}
    count_rows = db.query(
        Transaction.asset, func.count(Transaction.id)
    ).group_by(Transaction.asset).all()
    for asset, cnt in count_rows:
        event_counts[asset] = cnt

    coins = []
    seen_aliases = set()

    for asset in sorted(all_assets):
        canonical = asset
        for alias_key, aliases in _COIN_ALIASES.items():
            if asset in aliases:
                canonical = alias_key
                break
        if canonical in seen_aliases:
            continue
        seen_aliases.add(canonical)

        # Compute balance using the same dedup logic as coin_flow
        coin_names = _get_coin_names(asset)
        coin_txns = db.query(Transaction).filter(
            Transaction.asset.in_(coin_names)
        ).order_by(Transaction.datetime).all()
        deduped = _deduplicate(coin_txns, db)

        balance = 0.0
        for t in deduped:
            amt = t.amount or 0
            txn_type = t.type or ""
            if txn_type in _CREDIT_TYPES:
                balance += amt
            elif txn_type in _DEBIT_TYPES:
                balance -= amt

        types = dict(type_counts.get(asset, {}))
        coins.append({
            "asset": asset,
            "total_events": event_counts.get(asset, 0),
            "current_balance": round(balance, 8),
            "has_deposits": asset in dep_coins,
            "has_withdrawals": asset in wth_coins,
            "has_round_trip": asset in dep_coins and asset in wth_coins,
            "types": types,
        })

    coins.sort(key=lambda c: -c["total_events"])
    return {"coins": coins, "total": len(coins)}
