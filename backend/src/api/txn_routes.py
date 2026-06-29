"""
GET /api/v1/transactions  -- query with filters
GET /api/v1/holdings      -- current snapshot from DB
GET /api/v1/financial-years -- list of FY periods with transaction counts
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.config import FY_DATE_RANGES
from src.db.database import get_db
from src.db.models import Transaction

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class TransactionOut(BaseModel):
    id: str
    datetime: Optional[str] = None
    type: Optional[str] = None
    asset: Optional[str] = None
    amount: Optional[float] = None
    fee: Optional[float] = None
    fee_asset: Optional[str] = None
    price: Optional[float] = None
    quote_amount: Optional[float] = None
    counter_asset: Optional[str] = None
    txhash: Optional[str] = None
    network: Optional[str] = None
    address: Optional[str] = None
    source_wallet: Optional[str] = None
    dest_wallet: Optional[str] = None
    transfer_type: Optional[int] = None
    source_endpoint: Optional[str] = None
    exchange: Optional[str] = None
    external_id: Optional[str] = None
    order_id: Optional[str] = None
    status: Optional[str] = None


class TransactionsPage(BaseModel):
    total: int
    page: int
    limit: int
    data: List[TransactionOut]


class HoldingItem(BaseModel):
    asset: str
    total_amount: float
    source: str  # exchange name


class FinancialYearInfo(BaseModel):
    fy: str
    start: str
    end: str
    transaction_count: int


# ---------------------------------------------------------------------------
# GET /transactions
# ---------------------------------------------------------------------------

@router.get("/transactions", response_model=TransactionsPage)
def list_transactions(
    fy: Optional[str] = Query(None, description="Financial year, e.g. 2020-21"),
    asset: Optional[str] = Query(None),
    type: Optional[str] = Query(None, description="BUY, SELL, DEPOSIT, ..."),
    source: Optional[str] = Query(None, description="excel or api"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)

    if fy and fy in FY_DATE_RANGES:
        start_dt, end_dt = FY_DATE_RANGES[fy]
        q = q.filter(
            Transaction.datetime >= start_dt.isoformat(),
            Transaction.datetime <= end_dt.isoformat(),
        )

    if source == "excel":
        q = q.filter(Transaction.source_endpoint.like("excel_%"))
    elif source == "api":
        q = q.filter(~Transaction.source_endpoint.like("excel_%"))

    if asset:
        q = q.filter(Transaction.asset == asset.upper())

    if type:
        q = q.filter(Transaction.type == type.upper())

    total = q.count()
    rows = (
        q.order_by(Transaction.datetime.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return TransactionsPage(
        total=total,
        page=page,
        limit=limit,
        data=[_txn_to_out(r) for r in rows],
    )


def _txn_to_out(t: Transaction) -> TransactionOut:
    return TransactionOut(
        id=t.id,
        datetime=t.datetime,
        type=t.type,
        asset=t.asset,
        amount=t.amount,
        fee=t.fee,
        fee_asset=t.fee_asset,
        price=t.price,
        quote_amount=t.quote_amount,
        counter_asset=t.counter_asset,
        txhash=t.txhash,
        network=t.network,
        address=t.address,
        source_wallet=t.source_wallet,
        dest_wallet=t.dest_wallet,
        transfer_type=t.transfer_type,
        source_endpoint=t.source_endpoint,
        exchange=t.exchange,
        external_id=t.external_id,
        order_id=t.order_id,
        status=t.status,
    )


# ---------------------------------------------------------------------------
# GET /holdings
# ---------------------------------------------------------------------------

@router.get("/holdings", response_model=List[HoldingItem])
def get_holdings(db: Session = Depends(get_db)):
    """
    Compute a naive holdings snapshot by summing amounts:
      + DEPOSIT, BUY, P2P_BUY, FIAT_BUY, CONVERT (as acquisition)
      - WITHDRAWAL, SELL, P2P_SELL, FIAT_SELL, DUST_CONVERSION
    """
    # Credits (coin comes in)
    credit_types = {"BUY", "DEPOSIT", "P2P_BUY", "FIAT_BUY", "CONVERT"}
    # Debits (coin goes out)
    debit_types = {"SELL", "WITHDRAWAL", "P2P_SELL", "FIAT_SELL", "DUST_CONVERSION"}

    credit_q = (
        db.query(
            Transaction.asset,
            Transaction.exchange,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(Transaction.type.in_(credit_types))
        .group_by(Transaction.asset, Transaction.exchange)
        .all()
    )

    debit_q = (
        db.query(
            Transaction.asset,
            Transaction.exchange,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(Transaction.type.in_(debit_types))
        .group_by(Transaction.asset, Transaction.exchange)
        .all()
    )

    # Merge into a dict keyed by (asset, exchange)
    holdings: dict[tuple[str, str], float] = {}
    for row in credit_q:
        key = (row.asset, row.exchange)
        holdings[key] = holdings.get(key, 0) + (row.total or 0)
    for row in debit_q:
        key = (row.asset, row.exchange)
        holdings[key] = holdings.get(key, 0) - (row.total or 0)

    result = []
    for (asset, exchange), total in sorted(holdings.items()):
        if abs(total) > 1e-12:
            result.append(HoldingItem(
                asset=asset,
                total_amount=round(total, 12),
                source=exchange,
            ))

    return result


# ---------------------------------------------------------------------------
# GET /financial-years
# ---------------------------------------------------------------------------

@router.get("/financial-years", response_model=List[FinancialYearInfo])
def list_financial_years(db: Session = Depends(get_db)):
    """Return all configured FYs with the count of stored transactions."""
    result = []
    for fy, (start_dt, end_dt) in sorted(FY_DATE_RANGES.items()):
        count = (
            db.query(func.count(Transaction.id))
            .filter(
                Transaction.datetime >= start_dt.isoformat(),
                Transaction.datetime <= end_dt.isoformat(),
            )
            .scalar()
        )
        result.append(FinancialYearInfo(
            fy=fy,
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
            transaction_count=count or 0,
        ))
    return result
