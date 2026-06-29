"""
SQLAlchemy ORM models.

SQLite adaptations from the PostgreSQL schema in architecture.md:
  - TEXT instead of UUID (store uuid4 hex strings)
  - TEXT instead of JSONB (store JSON strings)
  - REAL instead of DECIMAL
  - TEXT instead of TIMESTAMPTZ (store ISO-8601 strings)
"""

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Text, primary_key=True)                 # uuid4 hex
    datetime = Column(Text, nullable=False)              # ISO-8601 UTC
    type = Column(Text, nullable=False)                  # BUY, SELL, DEPOSIT, ...
    asset = Column(Text, nullable=False)
    amount = Column(Float, nullable=False, default=0)
    fee = Column(Float, default=0)
    fee_asset = Column(Text)
    price = Column(Float)                                # per-unit in counter_asset
    quote_amount = Column(Float)                         # total in counter_asset
    counter_asset = Column(Text)
    price_inr = Column(Float)
    value_inr = Column(Float)
    txhash = Column(Text)                                # on-chain TxHash
    network = Column(Text)
    address = Column(Text)
    source_wallet = Column(Text)                         # e.g. "binance_spot"
    dest_wallet = Column(Text)
    transfer_type = Column(Integer)                      # 0=external, 1=internal
    source_endpoint = Column(Text)                       # e.g. "spot_trade"
    exchange = Column(Text, nullable=False)               # "binance"
    external_id = Column(Text)                           # exchange's id for dedup
    order_id = Column(Text)
    status = Column(Text)
    match_id = Column(Text)                              # FK to matches.id
    match_confidence = Column(Integer)
    needs_review = Column(Boolean, default=False)
    raw_json = Column(Text)                              # JSON string
    created_at = Column(Text)
    updated_at = Column(Text)

    __table_args__ = (
        UniqueConstraint("exchange", "source_endpoint", "external_id",
                         name="uq_txn_dedup"),
        Index("idx_txns_datetime", "datetime"),
        Index("idx_txns_asset", "asset"),
        Index("idx_txns_type", "type"),
        Index("idx_txns_txhash", "txhash"),
        Index("idx_txns_exchange", "exchange"),
        Index("idx_txns_match_id", "match_id"),
    )


class Match(Base):
    __tablename__ = "matches"

    id = Column(Text, primary_key=True)
    withdrawal_txn_id = Column(Text, nullable=False)
    deposit_txn_id = Column(Text, nullable=False)
    match_type = Column(Text, nullable=False)            # txhash_exact, fingerprint, …
    confidence = Column(Integer, nullable=False)
    amount_diff = Column(Float)
    time_diff_seconds = Column(Integer)
    reviewed = Column(Boolean, default=False)
    reviewer_action = Column(Text)
    created_at = Column(Text)


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Text, primary_key=True)
    label = Column(Text, nullable=False, unique=True)
    type = Column(Text, nullable=False)                  # exchange, hot_wallet, …
    exchange = Column(Text)
    chain = Column(Text)
    address = Column(Text)
    is_own = Column(Boolean, default=True)
    created_at = Column(Text)
