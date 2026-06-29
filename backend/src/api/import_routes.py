"""
POST /api/v1/import/excel -- import exchange Excel exports (e.g. Binance Data
Download Center).

Auto-detects the exchange and type from row 3. Binance exports have metadata
in rows 1-9, headers in row 10, data from row 11. All files are .xlsx.
"""

from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.db.models import Transaction
from src.exchanges import detect_file_type, get_exchange

logger = logging.getLogger(__name__)
router = APIRouter()


def _uuid() -> str:
    return uuid.uuid4().hex


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

def _process_one_file(file_content: bytes, filename: str, db: Session) -> dict:
    """Parse and import a single Excel file. Returns a result dict."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(file_content))
    ws = wb.active

    all_rows = []
    for row in ws.iter_rows(
        min_row=1, max_row=ws.max_row, max_col=ws.max_column, values_only=True
    ):
        all_rows.append(list(row))
    wb.close()

    if len(all_rows) < 11:
        return {"file": filename, "status": "error", "error": "File too short"}

    row3_text = " ".join(str(v).strip() for v in all_rows[2] if v is not None)
    exchange_name, detected = detect_file_type(row3_text)

    if not detected:
        return {"file": filename, "status": "error", "error": f"Unknown type: '{row3_text}'"}

    # Get the parser from the exchange registry
    ex = get_exchange(exchange_name)
    parsers = ex.get("parsers", {})
    parser = parsers.get(detected)

    if not parser:
        return {"file": filename, "status": "error", "error": f"No parser for {exchange_name}/{detected}"}

    headers = [str(v or "").strip() for v in all_rows[9]]

    data_rows = []
    for row in all_rows[10:]:
        values = list(row)
        non_empty = [v for v in values if v is not None and str(v).strip()]
        if not non_empty:
            continue
        row_text = " ".join(str(v or "") for v in values)
        if "No data" in row_text:
            continue
        data_rows.append(values)

    txns = parser(headers, data_rows)

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
            txhash=t.get("txhash"),
            network=t.get("network"),
            address=t.get("address"),
            source_wallet=t.get("source_wallet"),
            dest_wallet=t.get("dest_wallet"),
            source_endpoint=t.get("source_endpoint"),
            exchange=t.get("exchange", "binance"),
            external_id=t.get("external_id"),
            order_id=t.get("order_id"),
            status=t.get("status"),
            needs_review=False,
            created_at=t.get("created_at"),
            updated_at=t.get("updated_at"),
        )
        db.add(row)
        inserted += 1

    if inserted > 0:
        db.commit()

    logger.info(
        "Import: file=%s, exchange=%s, type=%s, parsed=%d, inserted=%d, skipped=%d",
        filename, exchange_name, detected, len(txns), inserted, skipped,
    )

    return {
        "file": filename,
        "status": "success",
        "exchange": exchange_name,
        "type_detected": detected,
        "rows_in_file": len(data_rows),
        "rows_parsed": len(txns),
        "inserted": inserted,
        "skipped": skipped,
    }


@router.post("/import/excel")
async def import_excel(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """Import one or more exchange Excel export files."""
    results = []
    total_inserted = 0
    total_skipped = 0
    total_parsed = 0

    for f in files:
        if not f.filename or not f.filename.endswith((".xlsx", ".xls")):
            results.append({"file": f.filename, "status": "error", "error": "Not an .xlsx file"})
            continue

        content = await f.read()
        try:
            result = _process_one_file(content, f.filename, db)
        except Exception as exc:
            logger.exception("Failed to process %s", f.filename)
            result = {"file": f.filename, "status": "error", "error": str(exc)}

        results.append(result)
        if result.get("status") == "success":
            total_inserted += result.get("inserted", 0)
            total_skipped += result.get("skipped", 0)
            total_parsed += result.get("rows_parsed", 0)

    return {
        "files_processed": len(results),
        "total_parsed": total_parsed,
        "total_inserted": total_inserted,
        "total_skipped": total_skipped,
        "results": results,
    }


@router.get("/import/tally")
def import_tally(
    fy: str | None = None,
    asset: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Compare API-synced vs Excel-imported data with breakdowns.
    Supports filtering by FY and/or asset.
    """
    from sqlalchemy import func
    from src.config import FY_DATE_RANGES

    q = db.query(Transaction)

    if fy and fy in FY_DATE_RANGES:
        start_dt, end_dt = FY_DATE_RANGES[fy]
        q = q.filter(
            Transaction.datetime >= start_dt.isoformat(),
            Transaction.datetime <= end_dt.isoformat(),
        )

    if asset:
        q = q.filter(Transaction.asset == asset.upper())

    # --- by source_endpoint + type ---
    source_rows = (
        q.with_entities(
            Transaction.source_endpoint,
            Transaction.type,
            func.count(Transaction.id),
            func.sum(Transaction.amount),
        )
        .group_by(Transaction.source_endpoint, Transaction.type)
        .all()
    )

    api_sources = {}
    excel_sources = {}
    for ep, txn_type, cnt, total_amt in source_rows:
        is_excel = ep.startswith("excel_")
        bucket = excel_sources if is_excel else api_sources
        if ep not in bucket:
            bucket[ep] = {"total": 0, "types": {}}
        bucket[ep]["total"] += cnt
        bucket[ep]["types"][txn_type] = {
            "count": cnt,
            "amount": round(total_amt or 0, 8),
        }

    # --- by asset (top coins) ---
    asset_rows = (
        q.with_entities(
            Transaction.asset,
            Transaction.source_endpoint,
            func.count(Transaction.id),
        )
        .group_by(Transaction.asset, Transaction.source_endpoint)
        .all()
    )

    coins = {}
    for coin, ep, cnt in asset_rows:
        if coin not in coins:
            coins[coin] = {"api": 0, "excel": 0}
        if ep.startswith("excel_"):
            coins[coin]["excel"] += cnt
        else:
            coins[coin]["api"] += cnt

    # --- by type (aggregated) ---
    type_rows = (
        q.with_entities(
            Transaction.type,
            Transaction.source_endpoint,
            func.count(Transaction.id),
        )
        .group_by(Transaction.type, Transaction.source_endpoint)
        .all()
    )

    by_type = {}
    for txn_type, ep, cnt in type_rows:
        if txn_type not in by_type:
            by_type[txn_type] = {"api": 0, "excel": 0}
        if ep.startswith("excel_"):
            by_type[txn_type]["excel"] += cnt
        else:
            by_type[txn_type]["api"] += cnt

    # --- available filter values ---
    all_assets = sorted(set(
        r[0] for r in db.query(Transaction.asset).distinct().all() if r[0]
    ))

    return {
        "filters": {"fy": fy, "asset": asset},
        "totals": {
            "api": sum(v["total"] for v in api_sources.values()),
            "excel": sum(v["total"] for v in excel_sources.values()),
        },
        "by_source": {"api": api_sources, "excel": excel_sources},
        "by_type": by_type,
        "by_asset": coins,
        "available_assets": all_assets,
    }
