# BINANCE.MD — Binance Data Extraction & Import Module

## Project Context

Production-grade crypto portfolio tracker replacing Koinly. This module handles complete data ingestion from Binance via **Excel imports** from the Binance Data Download Center.

**Why Excel-only (no API sync):** Binance API has retention limits that delete old data:
- Deposits/Withdrawals: 90-day retention
- C2C/P2P: 6-month retention
- Spot trades via `myTrades`: No retention limit, but incomplete without deposit/withdrawal context

Koinly has the same limitation — it calls these APIs and silently misses historical P2P trades, causing portfolio valuation errors (₹1L shown vs ₹2L actual). The Binance Data Download Center provides **complete history with no retention limits**.

---

## Tech Stack

- **Language:** Python 3.11+
- **Storage:** SQLite via SQLAlchemy ORM (`backend/data/crypto_tracker.db`)
- **API Framework:** FastAPI with async file upload support
- **Excel Parsing:** `openpyxl` for .xlsx files

---

## Data Source

All Binance data is imported via **Excel exports** from the Binance Data Download Center (binance.com → Orders → Data Download Center).

**Why not API?** Binance REST API has retention limits:
- Deposits/Withdrawals: **90-day retention** — *"Default startTime: 90 days from current timestamp"*
- C2C/P2P: **6-month retention** — *"You can only view data from the past 6 months"*
- Spot trades: No retention limit, but incomplete without deposit/withdrawal context

**Source:** https://developers.binance.com/docs/c2c/rest-api, https://developers.binance.com/docs/wallet/capital/deposite-history

The Data Download Center provides **complete history with no retention limits** — all the way back to account creation.

---

## Excel Import — Supported File Types

`POST /api/v1/import/excel` accepts bulk .xlsx uploads from Binance Data Download Center. Auto-detects type from Row 3 of each file.

### File Format (all types)
- Rows 1-9: Binance branding, user info, period metadata
- Row 10: Column headers
- Row 11+: Data rows

### Supported Types & Column Mappings

#### 1. C2C Order History
**Detection:** Row 3 contains "C2C"
**Headers:** `Order Number | Order Type | Asset | Fiat Type | Total Price | Price | Quantity | Exchange rate | Maker Fee | Taker Fee | Counterparty | Status | Created Time`

| Excel Column | → Transaction Field |
|---|---|
| Order Number | external_id |
| Order Type | type ("Buy"→P2P_BUY, "Sell"→P2P_SELL) |
| Asset | asset |
| Fiat Type | counter_asset (INR) |
| Total Price | quote_amount |
| Price | price |
| Quantity | amount |
| Maker Fee + Taker Fee | fee (summed) |
| Created Time | datetime |

Filters: Only `Status = "Completed"` rows imported.
Source endpoint: `excel_c2c`

#### 2. Deposit History
**Detection:** Row 3 contains "Deposit"
**Headers:** `Time | Coin | Network | Amount | Address | TXID | Status`

| Excel Column | → Transaction Field |
|---|---|
| TXID | external_id, txhash |
| Coin | asset |
| Amount | amount |
| Network | network |
| Address | address |
| Time | datetime |

Filters: Only rows with non-empty TXID.
Source endpoint: `excel_deposit`

#### 3. Withdraw History
**Detection:** Row 3 contains "Withdraw"
**Headers:** `Time | Coin | Network | Amount | Fee | Address | TXID | Status`

Same as deposits plus `Fee` column.
Source endpoint: `excel_withdrawal`

#### 4. Spot Trade History
**Detection:** Row 3 contains "Spot Trade"
**Headers:** `Time | Pair | Side | Price | Executed | Amount | Fee`

**Special parsing:** Values have embedded units (e.g., `82.9USUAL`, `72.123USDT`). The `_split_amount_unit()` function extracts number and asset symbol.

| Excel Column | → Transaction Field |
|---|---|
| Time | datetime |
| Side | type (BUY/SELL) |
| Executed | amount + asset (parsed from "82.9USUAL") |
| Amount | quote_amount + counter_asset (parsed from "72.123USDT") |
| Fee | fee + fee_asset (parsed) |
| Price | price |

Source endpoint: `excel_spot_trade`

#### 5. Spot Order History
**Detection:** Row 3 contains "Spot Order"
**Headers:** `Time | OrderNo | Pair | Type | Side | Order Price | Order Amount | Time | Executed | Average Price | Trading total | Status`

Filters: Only `Status IN (FILLED, PARTIALLY_FILLED)`.
Note: Headers contain invisible BOM characters — parser uses fuzzy matching.
Source endpoint: `excel_spot_order`

#### 6. Convert Order History
**Detection:** Row 3 contains "Convert"
Source endpoint: `excel_convert`

#### 7. Transaction History (Master Ledger)
**Detection:** Row 3 contains "Transaction"
**Headers:** `User ID | Time | Account | Operation | Coin | Change | Remark`

Maps 26 unique Operation types to transaction types:

| Operation | → Type |
|---|---|
| Transaction Buy | BUY |
| Transaction Spend / Transaction Sold | SELL |
| Transaction Fee / Fee / Funding Fee | FEE |
| Transaction Revenue | REWARD |
| P2P Trading | P2P_BUY (positive Change) / P2P_SELL (negative) |
| Deposit | DEPOSIT |
| Withdraw | WITHDRAWAL |
| Binance Convert | CONVERT |
| Small Assets Exchange BNB | DUST_CONVERSION |
| Distribution / Airdrop Assets / Commission Rebate / Crypto Box | REWARD |
| Launchpool Airdrop - User Claim Distribution | REWARD |
| Launchpool Subscription/Redemption / Simple Earn Flexible * | STAKING |
| Token Swap - Distribution / Redenomination/Rebranding | CONVERT |
| Transfer Between Spot and Funding/UM Futures | INTERNAL_TRANSFER |
| Asset Recovery | REWARD |
| Realized Profit and Loss | REWARD |

Account field maps to wallets: Spot→`binance_spot`, Funding→`binance_funding`, UM Futures→`binance_futures`
Source endpoint: `excel_transaction_history`

---

## API vs Excel Data Separation

All data goes into one unified `transactions` table. The `source_endpoint` column distinguishes origin:

| Source | source_endpoint values |
|--------|----------------------|
| **API Sync** | `spot_trade`, `fiat_order`, `dust`, `convert` |
| **Excel Import** | `excel_c2c`, `excel_deposit`, `excel_withdrawal`, `excel_spot_trade`, `excel_spot_order`, `excel_convert`, `excel_transaction_history` |

**Deduplication key:** `(exchange, source_endpoint, external_id)` — prevents duplicate imports but allows the same transaction to exist from both API and Excel sources for tallying/comparison.

**Tally endpoint:** `GET /api/v1/import/tally?fy=2024-25&asset=BTC` compares counts between API and Excel by type, by coin, and by source.

---

## Symbol Discovery Pipeline

The `myTrades` endpoint requires a `symbol` param — you cannot request "all trades." Discovery pipeline:

```
Step 1: GET /api/v3/account → coins with balance > 0
Step 2: Scan convert trades → fromAsset + toAsset coins
Step 3: Scan dust conversions → fromAsset coins
Step 4: Union with MANUAL_COINS (131 hardcoded coins in config.py)
Step 5: Cross-product with QUOTE_ASSETS → candidate symbols
Step 6: Validate against GET /api/v3/exchangeInfo → filter to real pairs
Step 7: Query myTrades for each valid pair (fromId pagination)
```

**QUOTE_ASSETS:** `USDT, BTC, BNB, ETH, BUSD, FDUSD, USDC, INR`

**Note:** Deposits and withdrawals are NOT used for symbol discovery (removed due to 90-day API retention). The MANUAL_COINS list compensates.

---

## Unified Transaction Schema

Every record is normalized into this schema:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | uuid4 primary key |
| `datetime` | TEXT | ISO-8601 UTC timestamp |
| `type` | TEXT | BUY, SELL, DEPOSIT, WITHDRAWAL, P2P_BUY, P2P_SELL, CONVERT, DUST_CONVERSION, FEE, REWARD, STAKING, INTERNAL_TRANSFER, FIAT_BUY, FIAT_SELL |
| `asset` | TEXT | Primary coin (BTC, ETH, SOL, etc.) |
| `amount` | FLOAT | Quantity of primary coin |
| `fee` | FLOAT | Fee paid |
| `fee_asset` | TEXT | Currency of the fee (BNB, USDT, etc.) |
| `price` | FLOAT | Per-unit price in counter_asset |
| `quote_amount` | FLOAT | Total value in counter_asset |
| `counter_asset` | TEXT | Quote currency (USDT, INR, BTC, etc.) |
| `price_inr` | FLOAT | Resolved INR price (for tax — not yet implemented) |
| `value_inr` | FLOAT | Total INR value (not yet implemented) |
| `txhash` | TEXT | On-chain Transaction Hash |
| `network` | TEXT | Blockchain network |
| `address` | TEXT | Wallet address |
| `source_wallet` | TEXT | From wallet (binance_spot, binance_p2p, external, etc.) |
| `dest_wallet` | TEXT | To wallet |
| `transfer_type` | INT | 0=external, 1=internal |
| `source_endpoint` | TEXT | Data origin (spot_trade, excel_c2c, etc.) |
| `exchange` | TEXT | Always "binance" for this module |
| `external_id` | TEXT | Exchange's ID for deduplication |
| `order_id` | TEXT | Associated order ID |
| `status` | TEXT | COMPLETED, FILLED, etc. |
| `raw_json` | TEXT | Original data for audit |

---

## API Endpoints

All under `/api/v1` prefix.

### Transactions
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/transactions` | Paginated query. Filters: `?fy=&asset=&type=&page=&limit=` |
| GET | `/holdings` | Current asset balance snapshot (credits - debits) |
| GET | `/financial-years` | List FY periods with transaction counts |

### Graph (React Flow format)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/graph/overview` | Full coin-flow graph. Filter: `?fy=` |
| GET | `/graph/asset/{asset}` | Per-asset flow graph. Filter: `?fy=` |

### Import
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/import/excel` | Bulk upload .xlsx files (multipart). Auto-detects type. |

### Health
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Returns `{"status": "ok"}` |

---

## Known Data Overlap

Importing multiple Excel export types creates duplicate records for the same trade:

| Actual Event | Appears In |
|---|---|
| 1 spot buy | Transaction History ("Transaction Buy" + "Transaction Fee"), Spot Trade History, Spot Order History |
| 1 P2P buy | Transaction History ("P2P Trading"), C2C Order History |
| 1 deposit | Transaction History ("Deposit"), Deposit History |

These are stored as separate records (different `source_endpoint` values) by design — deduplication prevents the same record from the same source being imported twice, but allows the same event to exist from multiple sources.

**Recommendation:** For tax calculations, use Transaction History as the single source of truth — it contains all operations. Use individual exports (Spot Trade, C2C, etc.) for verification only.

---

## Implementation Status

### ✅ Completed
- [x] Excel import for all 7 Binance Data Download Center export types
- [x] Bulk file upload (multiple files in one request)
- [x] Auto-detection of Excel export type from Row 3
- [x] Embedded unit parsing for Spot Trade values (e.g., "82.9USUAL")
- [x] Deduplication on (exchange, source_endpoint, external_id)
- [x] Modular architecture (`exchanges/binance/` self-contained module)
- [x] React Flow graph visualization (5-column layout)
- [x] Transaction explorer with filters (year, asset, type)
- [x] Stat cards: Total Buys, Total Sells, P2P Invested (INR), Conversions, Total Fees (per-asset breakdown)

### 🔲 Not Yet Implemented
- [ ] Transfer matching engine (TxHash + fingerprint + fuzzy)
- [ ] FIFO cost basis tracking
- [ ] INR price resolution (P2P direct → CoinGecko fallback)
- [ ] Section 115BBH tax calculation
- [ ] Schedule VDA output
- [ ] On-chain scanning (BSC, ETH, SOL)
- [ ] WazirX, CoinDCX, Mudrex connectors

---

## API Documentation References

- Spot Account Endpoints: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
- Wallet/Capital (Deposit): https://developers.binance.com/docs/wallet/capital/deposite-history
- Wallet/Capital (Withdrawal): https://developers.binance.com/docs/wallet/capital/withdraw-history
- C2C/P2P: https://developers.binance.com/docs/c2c/rest-api
- Convert: https://developers.binance.com/docs/convert/rest-api
- Wallet Change Log: https://developers.binance.com/docs/wallet/change-log
