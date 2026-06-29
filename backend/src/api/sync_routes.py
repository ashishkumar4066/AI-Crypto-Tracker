"""
POST /api/v1/sync   -- trigger Binance data extraction for a financial year.
GET  /api/v1/sync/status -- check sync progress and per-phase results.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.config import FY_DATE_RANGES
from src.db.database import get_db, SessionLocal
from src.db.models import Transaction
from src.exchanges import get_connector

logger = logging.getLogger(__name__)
router = APIRouter()

_running_syncs: dict[str, bool] = {}
_sync_status: dict[str, dict] = {}


class SyncRequest(BaseModel):
    fy: str


class SyncResponse(BaseModel):
    status: str
    message: str
    fy: str


def _insert_batch(db: Session, txns: list[dict], phase_name: str) -> tuple[int, int]:
    """Insert a batch of transactions, deduplicating and committing immediately."""
    inserted = 0
    skipped = 0
    for t in txns:
        existing = (
            db.query(Transaction.id)
            .filter_by(
                exchange=t.get("exchange"),
                source_endpoint=t.get("source_endpoint"),
                external_id=t.get("external_id"),
            )
            .first()
        )
        if existing:
            skipped += 1
            continue

        row = Transaction(
            id=t["id"],
            datetime=t.get("datetime"),
            type=t.get("type"),
            asset=t.get("asset"),
            amount=t.get("amount", 0),
            fee=t.get("fee", 0),
            fee_asset=t.get("fee_asset"),
            price=t.get("price"),
            quote_amount=t.get("quote_amount"),
            counter_asset=t.get("counter_asset"),
            price_inr=t.get("price_inr"),
            value_inr=t.get("value_inr"),
            txhash=t.get("txhash"),
            network=t.get("network"),
            address=t.get("address"),
            source_wallet=t.get("source_wallet"),
            dest_wallet=t.get("dest_wallet"),
            transfer_type=t.get("transfer_type"),
            source_endpoint=t.get("source_endpoint"),
            exchange=t.get("exchange", "binance"),
            external_id=t.get("external_id"),
            order_id=t.get("order_id"),
            status=t.get("status"),
            match_id=t.get("match_id"),
            match_confidence=t.get("match_confidence"),
            needs_review=t.get("needs_review", False),
            raw_json=t.get("raw_json"),
            created_at=t.get("created_at"),
            updated_at=t.get("updated_at"),
        )
        db.add(row)
        inserted += 1

    if inserted > 0:
        db.commit()

    logger.info("  [%s] inserted=%d, skipped=%d", phase_name, inserted, skipped)
    return inserted, skipped


def _run_sync(fy: str, start_dt: datetime, end_dt: datetime) -> None:
    """Background worker — runs each phase independently, commits per-phase."""
    logger.info("=" * 60)
    logger.info("SYNC STARTED for FY %s  (%s -> %s)", fy, start_dt.date(), end_dt.date())
    logger.info("=" * 60)

    status: dict = {"fy": fy, "phases": {}, "running": True, "error": None}
    _sync_status[fy] = status

    db = SessionLocal()
    connector = get_connector("binance")
    total_inserted = 0

    # C2C, deposits, and withdrawals are imported via Excel (Binance Data
    # Download Center) because the APIs have retention limits:
    #   - C2C: 6 months only
    #   - Deposits/Withdrawals: 90 days only
    phases = [
        ("fiat_orders", lambda: connector.get_fiat_orders(start_dt, end_dt)),
        ("dust",        lambda: connector.get_dust_conversions(start_dt, end_dt)),
        ("convert",     lambda: connector.get_convert_trades(start_dt, end_dt)),
    ]

    try:
        for phase_name, fetch_fn in phases:
            logger.info("--- Phase: %s ---", phase_name)
            try:
                txns = fetch_fn()
                logger.info("  API returned %d records", len(txns))
                inserted, skipped = _insert_batch(db, txns, phase_name)
                total_inserted += inserted
                status["phases"][phase_name] = {
                    "fetched": len(txns),
                    "inserted": inserted,
                    "skipped": skipped,
                    "error": None,
                }
            except Exception as exc:
                logger.exception("  Phase %s FAILED", phase_name)
                db.rollback()
                status["phases"][phase_name] = {
                    "fetched": 0,
                    "inserted": 0,
                    "skipped": 0,
                    "error": str(exc),
                }

        # Symbol discovery + spot trades (the big one)
        logger.info("--- Phase: symbol_discovery ---")
        try:
            symbols = connector.discover_symbols(start_dt, end_dt)
            logger.info("  Discovered %d valid trading pairs", len(symbols))
            status["phases"]["symbol_discovery"] = {
                "symbols_found": len(symbols),
                "error": None,
            }
        except Exception as exc:
            logger.exception("  Symbol discovery FAILED")
            symbols = []
            status["phases"]["symbol_discovery"] = {
                "symbols_found": 0,
                "error": str(exc),
            }

        if symbols:
            logger.info("--- Phase: spot_trades (%d symbols) ---", len(symbols))
            try:
                spot = connector.get_spot_trades(symbols, start_dt, end_dt)
                logger.info("  API returned %d spot trades", len(spot))
                inserted, skipped = _insert_batch(db, spot, "spot_trades")
                total_inserted += inserted
                status["phases"]["spot_trades"] = {
                    "fetched": len(spot),
                    "inserted": inserted,
                    "skipped": skipped,
                    "error": None,
                }
            except Exception as exc:
                logger.exception("  Spot trades FAILED")
                db.rollback()
                status["phases"]["spot_trades"] = {
                    "fetched": 0,
                    "inserted": 0,
                    "skipped": 0,
                    "error": str(exc),
                }
        else:
            logger.info("  Skipping spot trades — no symbols discovered")
            status["phases"]["spot_trades"] = {
                "fetched": 0,
                "inserted": 0,
                "skipped": 0,
                "error": "No symbols discovered",
            }

    except Exception:
        logger.exception("SYNC FATAL ERROR for FY %s", fy)
        status["error"] = "Fatal error — check logs"
    finally:
        db.close()
        _running_syncs.pop(fy, None)
        status["running"] = False
        status["total_inserted"] = total_inserted

    logger.info("=" * 60)
    logger.info("SYNC COMPLETE for FY %s  —  %d total records inserted", fy, total_inserted)
    for phase, info in status["phases"].items():
        err = info.get("error")
        fetched = info.get("fetched", info.get("symbols_found", "?"))
        marker = "✗" if err else "✓"
        logger.info("  %s %-20s  fetched=%-5s  %s", marker, phase, fetched, err or "")
    logger.info("=" * 60)


@router.post("/sync", response_model=SyncResponse)
def trigger_sync(body: SyncRequest, db: Session = Depends(get_db)):
    fy = body.fy
    if fy not in FY_DATE_RANGES:
        available = ", ".join(sorted(FY_DATE_RANGES.keys()))
        raise HTTPException(400, f"Unknown FY '{fy}'. Available: {available}")

    if _running_syncs.get(fy):
        raise HTTPException(409, f"Sync already running for FY {fy}")

    start_dt, end_dt = FY_DATE_RANGES[fy]
    _running_syncs[fy] = True

    thread = threading.Thread(target=_run_sync, args=(fy, start_dt, end_dt), daemon=True)
    thread.start()

    return SyncResponse(status="started", message=f"Sync started for FY {fy}", fy=fy)


@router.get("/sync/status")
def sync_status(fy: str | None = None):
    if fy:
        return _sync_status.get(fy, {"fy": fy, "phases": {}, "running": False, "error": "No sync run yet"})
    return _sync_status
