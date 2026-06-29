# ARCHITECTURE.md — CryptoTracker: Production-Grade Portfolio & Tax Engine

## Vision

A self-hosted crypto portfolio tracker purpose-built for Indian investors that solves what Koinly, CoinTracker, and KoinX get wrong: accurate transfer matching across exchanges and wallets, correct cost basis under Indian VDA tax rules, and a visual transaction graph that serves as an audit trail for ITR notices.

**What makes this different from Koinly:**
1. Transfer matching with confidence scores instead of silent misclassification
2. Indian-tax-first: Section 115BBH (30% flat, no loss offset, FIFO), TDS under 194S, Schedule VDA output
3. Transaction graph — an expanding mind map where you click any coin holding and trace its complete journey across wallets and exchanges
4. You own the data — no ₹15K/year subscription, no uploading sensitive financial data to a third-party server

---

## Exchanges & Data Sources

### Exchange APIs (API Key + Secret)

| Exchange | Base URL | Auth | Status |
|----------|----------|------|--------|
| **Binance** | `api.binance.com` | HMAC-SHA256 | Phase 1 (active) |
| **WazirX** | `api.wazirx.com` | HMAC-SHA256 | Phase 2 |
| **CoinDCX** | `api.coindcx.com` | HMAC-SHA256 | Phase 2 |
| **Mudrex** | `api.mudrex.com` | API Key | Phase 2 |

Each exchange gets its own connector module (`src/exchanges/<name>_connector.py`) that implements the `BaseExchangeConnector` interface. The output is always the unified transaction ledger schema — the connector's job is to normalize exchange-specific response formats into this common schema.

### On-Chain APIs (Wallet Address)

| Chain | Explorer API | Use Case |
|-------|-------------|----------|
| **BNB Smart Chain (BSC)** | BscScan API | MetaMask BEP-20 tokens, DeFi interactions |
| **Ethereum** | Etherscan API | ERC-20 tokens, DeFi, NFTs |
| **Solana** | Solscan API | SOL and SPL tokens |
| **Tron** | TronScan API | TRX, USDT-TRC20 transfers |

On-chain data fills the gap between exchanges. When you withdraw from Binance to MetaMask, Binance gives you the withdrawal TxHash. The chain explorer confirms the deposit side. When you interact with DeFi (swap on PancakeSwap, provide liquidity), those transactions only exist on-chain.

### Multi-Chain Aggregator (Optional)

Instead of hitting each explorer individually, use **Moralis** or **Covalent** API — one call returns all transactions for a wallet address across multiple chains. This simplifies the chain scanning layer but adds a dependency. Start with individual explorer APIs, consider Moralis when adding 3+ chains.

### Price Feed

| Source | Purpose | API |
|--------|---------|-----|
| **CoinGecko** | Historical prices (INR and USD) | Free tier, 30 calls/min |
| **P2P trade records** | Direct INR prices from actual trades | From exchange APIs |
| **Binance klines** | High-frequency historical OHLCV | `/api/v3/klines` |

**Price resolution priority:** P2P INR price (actual) → CoinGecko INR price → Binance USDT price × USDT/INR rate

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React PWA)                     │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐ │
│  │Dashboard │  │ Transaction  │  │   Tax     │  │  Flow     │ │
│  │ Holdings │  │   Explorer   │  │  Reports  │  │  Graph    │ │
│  │  P&L     │  │  (table +    │  │  (VDA,    │  │ (mind map │ │
│  │  Charts  │  │   filters)   │  │   ITR)    │  │  expand)  │ │
│  └──────────┘  └──────────────┘  └───────────┘  └───────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API
┌────────────────────────────┴────────────────────────────────────┐
│                      BACKEND (FastAPI + Python)                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    API Router Layer                       │  │
│  │  /api/v1/sync      — trigger data sync from exchanges    │  │
│  │  /api/v1/txns      — query unified ledger (filter/sort)  │  │
│  │  /api/v1/holdings  — current portfolio snapshot          │  │
│  │  /api/v1/matches   — transfer matching results + review  │  │
│  │  /api/v1/tax       — cost basis, gains, Schedule VDA     │  │
│  │  /api/v1/graph     — transaction graph data for viz      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Exchange   │  │  Transfer  │  │   FIFO   │  │  Graph    │  │
│  │  Sync      │  │  Matching  │  │   Cost   │  │  Builder  │  │
│  │  Engine    │  │  Engine    │  │   Basis  │  │           │  │
│  └──────┬─────┘  └──────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│         │               │              │              │         │
│  ┌──────┴───────────────┴──────────────┴──────────────┴─────┐  │
│  │                    Data Access Layer                      │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                   PostgreSQL (Supabase / Local)                  │
│                                                                  │
│  ┌──────────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │ transactions  │  │  matches  │  │  lots    │  │  wallets  │  │
│  │ (unified     │  │ (transfer │  │  (FIFO   │  │ (exchange │  │
│  │  ledger)     │  │  pairs)   │  │  queues) │  │  + chain) │  │
│  └──────────────┘  └───────────┘  └──────────┘  └───────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Pipeline

```
Step 1: INGEST
  ├── Exchange APIs → raw JSON per endpoint
  ├── Chain explorers → raw transaction list per address
  └── Store raw_json in transactions table (audit trail)

Step 2: NORMALIZE
  ├── Each connector transforms its response → unified ledger schema
  ├── Deduplicate on (exchange, source_endpoint, external_id)
  └── Classify: BUY, SELL, DEPOSIT, WITHDRAWAL, CONVERT, REWARD, DUST, P2P_BUY, P2P_SELL

Step 3: MATCH
  ├── Run transfer matching engine across all wallets
  ├── TxHash exact match (confidence: 100%)
  ├── Fingerprint match: same asset ± fee tolerance ± 30min window (confidence: 85-95%)
  ├── Fuzzy match: same asset, approximate amount, wider time window (confidence: 60-75%)
  ├── Link matched pairs as INTERNAL_TRANSFER
  └── Flag unmatched for manual review queue

Step 4: PRICE
  ├── Attach INR price to every transaction
  ├── P2P trades: use actual INR price from the trade
  ├── Spot trades: resolve via price chain (DOGE→USDT rate × USDT→INR rate)
  └── Deposits/withdrawals: use CoinGecko historical price at that timestamp

Step 5: CALCULATE
  ├── Build FIFO lot queue per asset
  ├── Track acquisition cost through internal transfers (cost basis carries forward)
  ├── On disposal: dequeue lots FIFO, compute gain/loss
  ├── Separate: short-term vs long-term (not relevant for Indian VDA, but useful)
  └── Aggregate per financial year

Step 6: REPORT
  ├── Holdings dashboard with current P&L
  ├── Transaction explorer with filters
  ├── Tax report: gains, losses, TDS paid, Schedule VDA
  └── Transaction flow graph for audit trail
```

---

## Core Data Models

### `transactions` (Unified Ledger)

```sql
CREATE TABLE transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    datetime          TIMESTAMPTZ NOT NULL,
    type              VARCHAR(20) NOT NULL,   -- BUY, SELL, DEPOSIT, WITHDRAWAL, P2P_BUY, P2P_SELL, CONVERT, DUST, REWARD, INTERNAL_TRANSFER
    asset             VARCHAR(20) NOT NULL,
    amount            DECIMAL(28, 12) NOT NULL,
    fee               DECIMAL(28, 12) DEFAULT 0,
    fee_asset         VARCHAR(20),
    price             DECIMAL(28, 12),         -- per unit in counter_asset
    quote_amount      DECIMAL(28, 12),         -- total in counter_asset
    counter_asset     VARCHAR(20),
    price_inr         DECIMAL(18, 4),          -- resolved INR price per unit
    value_inr         DECIMAL(18, 4),          -- total INR value
    txhash            VARCHAR(255),            -- on-chain TxHash
    network           VARCHAR(20),
    address           VARCHAR(255),
    source_wallet     VARCHAR(100),            -- e.g., "binance_spot", "metamask_bsc"
    dest_wallet       VARCHAR(100),
    transfer_type     SMALLINT,                -- 0=external, 1=internal
    source_endpoint   VARCHAR(50),             -- e.g., "spot_trade", "deposit", "c2c"
    exchange          VARCHAR(20) NOT NULL,     -- "binance", "wazirx", "coindcx", "mudrex", "on_chain"
    external_id       VARCHAR(255),            -- exchange's ID for dedup
    order_id          VARCHAR(255),
    status            VARCHAR(20),
    match_id          UUID,                    -- FK to matches table if part of a transfer pair
    match_confidence  SMALLINT,                -- 0-100
    needs_review      BOOLEAN DEFAULT false,
    raw_json          JSONB,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),

    UNIQUE(exchange, source_endpoint, external_id)
);

CREATE INDEX idx_txns_datetime ON transactions(datetime);
CREATE INDEX idx_txns_asset ON transactions(asset);
CREATE INDEX idx_txns_type ON transactions(type);
CREATE INDEX idx_txns_txhash ON transactions(txhash);
CREATE INDEX idx_txns_exchange ON transactions(exchange);
CREATE INDEX idx_txns_match_id ON transactions(match_id);
CREATE INDEX idx_txns_needs_review ON transactions(needs_review) WHERE needs_review = true;
```

### `matches` (Transfer Pairs)

```sql
CREATE TABLE matches (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_txn_id UUID NOT NULL REFERENCES transactions(id),
    deposit_txn_id    UUID NOT NULL REFERENCES transactions(id),
    match_type        VARCHAR(20) NOT NULL,    -- "txhash_exact", "fingerprint", "fuzzy", "manual"
    confidence        SMALLINT NOT NULL,        -- 0-100
    amount_diff       DECIMAL(28, 12),         -- withdrawal - deposit (should ≈ gas fee)
    time_diff_seconds INTEGER,                 -- timestamp difference
    reviewed          BOOLEAN DEFAULT false,
    reviewer_action   VARCHAR(20),             -- "confirmed", "rejected", "split"
    created_at        TIMESTAMPTZ DEFAULT now()
);
```

### `lots` (FIFO Cost Basis Tracking)

```sql
CREATE TABLE lots (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset             VARCHAR(20) NOT NULL,
    quantity          DECIMAL(28, 12) NOT NULL,
    remaining_qty     DECIMAL(28, 12) NOT NULL,
    cost_per_unit_inr DECIMAL(18, 4) NOT NULL,
    acquired_at       TIMESTAMPTZ NOT NULL,
    acquisition_txn_id UUID REFERENCES transactions(id),
    wallet            VARCHAR(100),
    disposed          BOOLEAN DEFAULT false,
    disposed_at       TIMESTAMPTZ,
    disposal_txn_id   UUID REFERENCES transactions(id),
    gain_inr          DECIMAL(18, 4),
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lots_asset_remaining ON lots(asset) WHERE remaining_qty > 0;
```

### `wallets` (Known Wallet Registry)

```sql
CREATE TABLE wallets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label       VARCHAR(100) NOT NULL UNIQUE,  -- "binance_spot", "metamask_bsc_0x1234"
    type        VARCHAR(20) NOT NULL,           -- "exchange", "hot_wallet", "cold_wallet", "defi"
    exchange    VARCHAR(20),                    -- "binance", "wazirx", etc. (null for on-chain)
    chain       VARCHAR(20),                    -- "BSC", "ETH", "SOL" (null for exchange)
    address     VARCHAR(255),                   -- wallet address (null for exchange)
    is_own      BOOLEAN DEFAULT true,           -- false for external addresses
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## Transaction Flow Graph (Mind Map Feature)

The signature feature: click any coin holding or transaction and see an expanding tree of where those coins came from and where they went.

### How It Works

**Data structure:** The `transactions` table + `matches` table form a directed graph:
- Nodes = wallet states (wallet + asset + timestamp)
- Edges = transactions (buy/sell/transfer)

**Graph query example:** "Show me the journey of my SOL"

```
INR 5000 (P2P Buy on Binance, 2023-01-15)
  └── 2.5 SOL acquired on Binance Spot
       └── 2.5 SOL withdrawn from Binance (TxHash: 0xabc...)
            └── 2.5 SOL deposited to MetaMask (same TxHash: 0xabc...)
                 ├── 1.0 SOL swapped on Jupiter → 50 USDC
                 └── 1.5 SOL transferred back to Binance (TxHash: 0xdef...)
                      └── 1.5 SOL deposited on Binance
                           └── 1.5 SOL sold for 4200 INR (P2P Sell)
                                └── Gain: 4200 - 3000 (cost basis) = ₹1200
                                     └── Tax @ 30% = ₹360
```

**UI implementation:**
- React component with expand/collapse nodes
- Start collapsed: show only current holdings
- Click a holding → expands to show acquisition source
- Click acquisition → expands to show where those coins came from
- Each node shows: asset, amount, datetime, wallet, TxHash (clickable → explorer link)
- Color coding: green = acquisition, red = disposal, blue = transfer, yellow = needs review

**Backend API:**
```
GET /api/v1/graph/asset/{asset}
  → Returns the full transaction tree for that asset

GET /api/v1/graph/txn/{txn_id}
  → Returns parent and child nodes for a specific transaction

GET /api/v1/graph/wallet/{wallet_label}
  → Returns all transaction flows through that wallet
```

**ITR audit use case:** If Income Tax department sends a notice asking about a specific transaction, you open the graph, find that transaction, and export the full chain from INR entry → intermediate transfers → final disposal → tax paid. One click generates a PDF audit trail.

---

## Exchange Connector Interface

Every exchange connector implements this interface:

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from datetime import datetime

class BaseExchangeConnector(ABC):
    """
    Abstract base class for exchange connectors.
    Each connector normalizes exchange-specific data into the
    unified transaction ledger schema.
    """

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.exchange_name: str = ""   # e.g., "binance"

    @abstractmethod
    def get_balances(self) -> List[Dict[str, Any]]:
        """Current holdings snapshot."""
        pass

    @abstractmethod
    def get_spot_trades(self) -> List[Dict[str, Any]]:
        """All spot/convert trades in unified schema."""
        pass

    @abstractmethod
    def get_deposits(self) -> List[Dict[str, Any]]:
        """All deposits with TxHash in unified schema."""
        pass

    @abstractmethod
    def get_withdrawals(self) -> List[Dict[str, Any]]:
        """All withdrawals with TxHash in unified schema."""
        pass

    @abstractmethod
    def get_fiat_trades(self) -> List[Dict[str, Any]]:
        """P2P and fiat on/off-ramp trades in unified schema."""
        pass

    @abstractmethod
    def get_other_events(self) -> List[Dict[str, Any]]:
        """Dust conversions, staking rewards, airdrops, etc."""
        pass

    def sync_all(self) -> List[Dict[str, Any]]:
        """Pull everything and return unified ledger entries."""
        results = []
        results.extend(self.get_spot_trades())
        results.extend(self.get_deposits())
        results.extend(self.get_withdrawals())
        results.extend(self.get_fiat_trades())
        results.extend(self.get_other_events())
        return results
```

### Exchange-Specific Notes

**WazirX:**
- API very similar to Binance (forked codebase)
- HMAC-SHA256 signing, same pattern
- Endpoints: `/api/v2/myTrades`, `/api/v2/funds`, `/sapi/v1/history/deposits`, `/sapi/v1/history/withdrawals`
- WazirX auto-transferred balances to Binance during their integration period — check for phantom entries
- P2P was less common here; most trades were direct INR pairs on the order book

**CoinDCX:**
- HMAC-SHA256 signing
- Endpoints: `/exchange/v1/orders/trade_history`, `/exchange/v1/users/balances`
- Supports direct INR pairs (BTC/INR, ETH/INR)
- Withdrawal/deposit history API may be limited — supplement with CSV export

**Mudrex:**
- Primarily a managed portfolio / vault product
- API may only provide vault-level P&L, not individual transactions
- May need CSV export as primary data source
- Track: deposits to vaults, vault earnings, withdrawals from vaults

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Language** | Python 3.11+ | Existing expertise, strong crypto/data ecosystem |
| **Backend API** | FastAPI | Async, auto-docs, Pydantic validation, existing stack |
| **Database (dev)** | SQLite | Zero-setup local dev, file-based, no Docker needed |
| **Database (prod)** | PostgreSQL (Supabase) | JSONB for raw data, strong indexing, free tier |
| **Frontend** | React (PWA) | Existing expertise, offline capability, mobile-ready |
| **Graph Viz** | React Flow or D3.js | Interactive node-based visualization for transaction graph |
| **Charts** | Recharts | Portfolio P&L charts, holdings pie chart |
| **Task Queue** | Celery + Redis (or simple cron) | Background sync, rate-limited API calls |
| **Price API** | CoinGecko (free) | Historical INR prices |
| **Deployment** | Self-hosted / Railway / Supabase Edge Functions | Full control over data |

---

## Phase Plan

### Phase 1: Binance Extraction (Current Sprint)
**Goal:** Extract ALL Binance data and produce a verified master ledger.

- [x] Binance API client with HMAC signing
- [x] All 8 endpoints (balances, trades, deposits, withdrawals, P2P, fiat, dust, convert)
- [x] Symbol discovery pipeline
- [x] 90-day / 30-day / fromId pagination
- [x] Unified ledger CSV export
- [ ] Add Convert trade flow endpoint
- [ ] Add internal wallet transfer endpoint
- [ ] Compare master ledger vs Koinly export → identify mismatches
- [ ] Fix mismatches → validate correct portfolio value

**Deliverable:** Verified Binance CSV that matches actual holdings.

### Phase 2: Multi-Exchange + Storage
**Goal:** Add remaining exchanges, store everything in PostgreSQL.

- [ ] Database schema creation (Supabase)
- [ ] BaseExchangeConnector interface
- [ ] WazirX connector (API structure similar to Binance)
- [ ] CoinDCX connector
- [ ] Mudrex connector (API or CSV fallback)
- [ ] Idempotent upsert with deduplication
- [ ] Incremental sync (only fetch new data since last sync)

**Deliverable:** All exchange data in one database, deduplicated.

### Phase 3: Transfer Matching + Cost Basis
**Goal:** Accurate reconciliation across all wallets and correct tax calculation.

- [ ] Transfer matching engine (TxHash → fingerprint → fuzzy)
- [ ] Confidence scoring
- [ ] Manual review queue UI
- [ ] On-chain scanner integration (BSC, ETH) for MetaMask transactions
- [ ] FIFO lot tracking
- [ ] INR price resolution chain
- [ ] Cost basis calculation per Indian VDA rules
- [ ] Gain/loss report per asset, per financial year

**Deliverable:** Accurate cost basis and P&L for every asset across all wallets.

### Phase 4: Tax & Compliance
**Goal:** ITR-ready reports and audit trail.

- [ ] Schedule VDA output (ITR-2 format)
- [ ] TDS tracking under Section 194S
- [ ] FY-wise capital gains summary
- [ ] Acquisition cost proof (linked to source P2P trade)
- [ ] Audit trail PDF export (for IT notices)
- [ ] Foreign asset disclosure check (Schedule FA — all foreign crypto holdings must be disclosed regardless of value; the ₹20L threshold applies to signing authority, not reporting)

**Deliverable:** One-click ITR filing data, defensible audit trail.

### Phase 5: Dashboard & Flow Graph
**Goal:** Visual portfolio management and the mind-map transaction explorer.

- [ ] React PWA setup
- [ ] Holdings dashboard (current value, total invested, unrealized P&L)
- [ ] Per-asset drill-down (average cost, lots, trade history)
- [ ] Transaction explorer with search/filter
- [ ] Transaction flow graph (the expanding mind map)
- [ ] Wallet-to-wallet Sankey diagram
- [ ] Export graph as PDF for ITR notices

**Deliverable:** Full product — the better Koinly.

### Phase 6: Automation & Scale
**Goal:** Set it and forget it.

- [ ] Scheduled background sync (hourly/daily)
- [ ] New transaction alerts (Telegram/email)
- [ ] Multi-user support (if making it a product)
- [ ] Backup and data export
- [ ] Mobile-optimized PWA

---

## Security Considerations

- API keys encrypted at rest (never stored in plaintext in DB)
- All exchange API keys are read-only (Tax Report API / no trading permissions)
- No withdrawal capability — system cannot move funds
- Self-hosted by default — financial data never leaves your infrastructure
- `.env` file for secrets, `.gitignore` enforced
- HTTPS only for all external API calls
- Rate limiting: respect exchange limits, built-in backoff

---

## File Structure (Full Project)

```
crypto-tracker/
├── architecture.md                ← This file (system overview)
├── binance.md                     ← Binance-specific module spec
├── binance_extractor.py           ← Standalone extraction script (Phase 1)
│
├── src/
│   ├── main.py                    ← FastAPI app entry point
│   ├── config.py                  ← Settings, env vars, constants
│   │
│   ├── exchanges/
│   │   ├── __init__.py
│   │   ├── base.py                ← BaseExchangeConnector ABC
│   │   ├── binance_connector.py
│   │   ├── wazirx_connector.py
│   │   ├── coindcx_connector.py
│   │   └── mudrex_connector.py
│   │
│   ├── chains/
│   │   ├── __init__.py
│   │   ├── base.py                ← BaseChainScanner ABC
│   │   ├── bsc_scanner.py
│   │   ├── eth_scanner.py
│   │   └── solana_scanner.py
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── sync_engine.py         ← Orchestrates multi-exchange sync
│   │   ├── transfer_matcher.py    ← Transfer matching algorithm
│   │   ├── price_resolver.py      ← INR price resolution chain
│   │   ├── fifo_engine.py         ← FIFO lot tracking + cost basis
│   │   ├── tax_calculator.py      ← Indian VDA tax computation
│   │   └── graph_builder.py       ← Transaction flow graph construction
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── transaction.py         ← Pydantic models for unified schema
│   │   ├── match.py
│   │   ├── lot.py
│   │   └── wallet.py
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── schema.sql
│   │   ├── migrations/
│   │   └── repository.py          ← CRUD operations
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── router.py              ← FastAPI router mounting
│   │   ├── sync_routes.py
│   │   ├── txn_routes.py
│   │   ├── holdings_routes.py
│   │   ├── tax_routes.py
│   │   └── graph_routes.py
│   │
│   └── utils/
│       ├── __init__.py
│       ├── hmac_signer.py         ← Generic HMAC-SHA256 signing
│       ├── rate_limiter.py        ← Token bucket rate limiter
│       ├── time_utils.py          ← Timestamp conversions
│       └── csv_export.py          ← CSV/Excel export utilities
│
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Transactions.jsx
│   │   │   ├── TaxReport.jsx
│   │   │   └── FlowGraph.jsx
│   │   ├── components/
│   │   │   ├── HoldingsTable.jsx
│   │   │   ├── TransactionRow.jsx
│   │   │   ├── MatchReview.jsx
│   │   │   └── GraphNode.jsx
│   │   └── hooks/
│   │       └── useApi.js
│   └── public/
│
├── tests/
│   ├── test_binance_connector.py
│   ├── test_transfer_matcher.py
│   ├── test_fifo_engine.py
│   ├── test_tax_calculator.py
│   └── fixtures/
│       ├── sample_trades.json
│       ├── sample_deposits.json
│       └── sample_withdrawals.json
│
├── exports/                       ← Generated CSVs and reports
├── .env.example
├── .gitignore
├── requirements.txt
├── docker-compose.yml             ← PostgreSQL + Redis for local dev
└── README.md
```

---

## Key Design Decisions

1. **Raw Python over LangChain/LangGraph:** Same philosophy as CryptoLens. Direct HTTP calls, full control over signing and pagination, no framework overhead. The exchange connectors are simple classes, not agent pipelines.

2. **PostgreSQL over MongoDB:** The transaction ledger is highly relational (lots reference transactions, matches link pairs, wallets are foreign keys). JSONB column for raw API responses gives us the document-store flexibility where needed.

3. **FIFO in application layer, not SQL:** Cost basis calculation requires ordered traversal of lots with partial consumption. This is cleaner in Python than in SQL window functions, and easier to debug/audit.

4. **Confidence scoring over silent matching:** Every transfer match gets a 0-100 confidence score. Anything below 85% goes to the review queue. This is the single biggest improvement over Koinly, which silently makes wrong decisions.

5. **Exchange-first, chain-second:** Start with exchange APIs (structured, reliable, complete trade data). Add on-chain scanning only after exchange data is verified. Most users' complete transaction history is reconstructable from exchange data alone; on-chain fills in DeFi interactions and confirms transfer matching.

6. **Self-hosted by default:** Indian tax data + crypto holdings = sensitive. No SaaS dependency for the core product. Supabase gives us managed PostgreSQL without losing control.
