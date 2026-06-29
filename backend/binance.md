# BINANCE.md — Binance Data Extraction & Reconciliation Module

## Project Context

Building a production-grade crypto portfolio tracker that replaces Koinly. This module handles complete data extraction from Binance using the REST API with API Key + HMAC-SHA256 authentication.

**Why this exists:** Koinly misclassifies internal transfers as trades, creating phantom balances. Our portfolio showed ₹1L in Koinly vs ₹2L actual — a 100% error caused by transfer-matching failures. This module fetches raw data with full transaction IDs and hashes so we can build accurate reconciliation ourselves.

**Scope of this file:** Binance only. Once this works end-to-end, we replicate the pattern for WazirX, CoinDCX, and Mudrex (see `architecture.md`).

---

## Tech Stack

- **Language:** Python 3.11+
- **HTTP:** `requests` (raw, no SDK wrapper — we want full control over signing and pagination)
- **Storage:** SQLite (local dev) → PostgreSQL (Supabase) for production
- **Schema:** Unified transaction ledger (see Data Model section)
- **Auth:** HMAC-SHA256 signed requests (API Key + Secret via env vars)
- **Rate Limiting:** Built-in delay + retry with exponential backoff

---

## API Key Setup

1. Log into Binance → Account → API Management
2. Click **"Create Tax Report API"** (read-only, no trading/withdrawal permissions)
3. Under IP Access Restrictions, select **"Unrestricted"** (or whitelist your server IP)
4. Save the API Key and Secret Key immediately — the secret is shown only once
5. Store as environment variables:

```bash
export BINANCE_API_KEY="your_key_here"
export BINANCE_API_SECRET="your_secret_here"
```

**Security rules:**

- Never commit keys to git (use `.env` file with `.gitignore`)
- Tax Report API keys cannot initiate trades or withdrawals — safe for data extraction
- Rotate keys every 90 days

---

## Data Categories & API Endpoints

There are **8 categories** of data in a Binance account. Missing any one of them causes reconciliation errors. Each is detailed below with endpoint, params, response schema, pagination strategy, and known gotchas.

### 1. Account Balances

**Purpose:** Current holdings snapshot + coin discovery for trade history extraction.

```
GET /api/v3/account
```

| Param            | Type    | Required | Notes                           |
| ---------------- | ------- | -------- | ------------------------------- |
| omitZeroBalances | BOOLEAN | No       | Set `true` to skip empty assets |
| recvWindow       | DECIMAL | No       | Max 60000                       |
| timestamp        | LONG    | Yes      | Server time in ms               |

**Response fields we use:**

```json
{
  "balances": [
    {
      "asset": "BTC",
      "free": "0.00234500",
      "locked": "0.00000000"
    }
  ],
  "uid": 354937868
}
```

**Pagination:** None needed — returns all assets in one call.

**Gotcha:** This only shows CURRENT balances. Coins you fully sold will not appear here. That's why we also mine deposit/withdrawal history for coin discovery (see Symbol Discovery Strategy below).

---

### 2. Spot Trade History

**Purpose:** Every buy/sell executed on the spot exchange. This is where your cost basis originates.

```
GET /api/v3/myTrades
```

| Param     | Type   | Required | Notes                                            |
| --------- | ------ | -------- | ------------------------------------------------ |
| symbol    | STRING | **Yes**  | e.g., "BTCUSDT" — must query per pair            |
| orderId   | LONG   | No       | Filter by specific order                         |
| startTime | LONG   | No       | **24-hour max window with endTime**              |
| endTime   | LONG   | No       | **24-hour max window with startTime**            |
| fromId    | LONG   | No       | TradeId to paginate from (gets trades >= fromId) |
| limit     | INT    | No       | Default 500, Max 1000                            |
| timestamp | LONG   | Yes      |                                                  |

**Response fields we use:**

```json
{
  "symbol": "BNBBTC",
  "id": 28457,
  "orderId": 100234,
  "orderListId": -1,
  "price": "4.00000100",
  "qty": "12.00000000",
  "quoteQty": "48.000012",
  "commission": "10.10000000",
  "commissionAsset": "BNB",
  "time": 1499865549590,
  "isBuyer": true,
  "isMaker": false,
  "isBestMatch": true
}
```

**Pagination strategy:** Use `fromId`, NOT time-based pagination.

- Time-based is capped at 24-hour windows — useless for 5+ years of history
- `fromId` has no time limit: fetch batch, take last `id + 1`, fetch next batch
- Stop when response returns fewer than `limit` records

**Gotcha — Symbol requirement:** This endpoint requires a `symbol` param. You cannot say "give me all trades." You must know which pairs you traded and query each one separately. See Symbol Discovery Strategy below.

**Gotcha — Missing trades:** If you used Binance Convert (simple buy/sell), those trades do NOT appear in `myTrades`. They only appear in `/sapi/v1/convert/tradeFlow`. This is the #1 reason Koinly misses transactions.

---

### 3. Deposit History (contains TxHash)

**Purpose:** Every coin that entered your Binance account. The `txId` field is the on-chain Transaction Hash — your primary join key for cross-wallet reconciliation.

```
GET /sapi/v1/capital/deposit/hisrec
```

| Param         | Type    | Required | Notes                                                                      |
| ------------- | ------- | -------- | -------------------------------------------------------------------------- |
| includeSource | BOOLEAN | No       | Set `true` to get `sourceAddress` — **always set this**                    |
| coin          | STRING  | No       | Filter by specific coin                                                    |
| status        | INT     | No       | 0=pending, 1=success, 6=credited-cant-withdraw, 7=wrong, 8=waiting-confirm |
| startTime     | LONG    | No       | Default: 90 days ago                                                       |
| endTime       | LONG    | No       | Default: now                                                               |
| offset        | INT     | No       | Default 0                                                                  |
| limit         | INT     | No       | Default 1000, Max 1000                                                     |
| txId          | STRING  | No       | Search by specific TxHash                                                  |
| timestamp     | LONG    | Yes      |                                                                            |

**Response fields we use:**

```json
{
  "id": "769800519366885376",
  "amount": "0.001",
  "coin": "BNB",
  "network": "BNB",
  "status": 1,
  "address": "bnb136ns6lfw4zs5hg4n85vdthaad7hq5m4gtkgf23",
  "addressTag": "101764890",
  "txId": "98A3EA560C6B3336D348B6C83F0F95ECE4F1F5919E94BD006E5BF3BF264FACFC",
  "insertTime": 1661493146000,
  "completeTime": 1661493146000,
  "transferType": 0,
  "confirmTimes": "1/1",
  "unlockConfirm": 0,
  "walletType": 0,
  "sourceAddress": "0x1234...",
  "travelRuleStatus": 0
}
```

**Critical fields for reconciliation:**

- `txId` — the on-chain TxHash. Paste this into BscScan/Etherscan to verify. This is your JOIN KEY when matching with MetaMask or other wallet records.
- `sourceAddress` — where the coins came FROM (only when `includeSource=true`)
- `transferType` — 0 = external (from another wallet/exchange), 1 = internal (Binance-to-Binance)
- `network` — which blockchain (BNB, ETH, TRX, SOL, etc.)
- `walletType` — 0 = Spot Wallet, 1 = Funding Wallet

**Pagination strategy:** 90-day chunked windows + offset.

- `startTime` to `endTime` cannot exceed 90 days
- Walk forward in 89-day chunks from `HISTORY_START` to now
- Within each chunk, paginate via `offset` (0, 1000, 2000...) until response < 1000

---

### 4. Withdrawal History (contains TxHash)

**Purpose:** Every coin that left your Binance account. The `txId` is the on-chain TxHash for matching with the receiving wallet.

```
GET /sapi/v1/capital/withdraw/history
```

| Param           | Type   | Required | Notes                                                           |
| --------------- | ------ | -------- | --------------------------------------------------------------- |
| coin            | STRING | No       | Filter by coin                                                  |
| withdrawOrderId | STRING | No       | Client-side ID if provided during withdrawal                    |
| status          | INT    | No       | 0=Email Sent, 2=Awaiting, 3=Rejected, 4=Processing, 6=Completed |
| offset          | INT    | No       |                                                                 |
| limit           | INT    | No       | Default 1000, Max 1000                                          |
| startTime       | LONG   | No       | Default: 90 days ago                                            |
| endTime         | LONG   | No       | Default: now                                                    |
| timestamp       | LONG   | Yes      |                                                                 |

**Response fields we use:**

```json
{
  "id": "b6ae22b3aa844210a7041aee7589627c",
  "amount": "8.91000000",
  "transactionFee": "0.004",
  "coin": "USDT",
  "status": 6,
  "address": "0x94df8b352de7f46f64b01d3666bf6e936e44ce60",
  "txId": "0xb5ef8c13b968a406cc62a93a8bd80f9e9a906ef1b3fcf20a2e48573c17659268",
  "applyTime": "2019-10-12 11:12:02",
  "network": "ETH",
  "transferType": 0,
  "withdrawOrderId": "WITHDRAWtest123",
  "info": "reason for failure if any",
  "confirmNo": 3,
  "walletType": 1,
  "txKey": "",
  "completeTime": "2023-03-23 16:52:41"
}
```

**Critical fields for reconciliation:**

- `txId` — on-chain TxHash. Match this with the deposit record on the receiving exchange/wallet.
- `address` — destination address (your MetaMask, CoinDCX deposit address, etc.)
- `transactionFee` — the network fee deducted. Amount received = `amount - transactionFee`
- `transferType` — 0 = external, 1 = internal (Binance-to-Binance)

**Pagination:** Same 90-day chunked strategy as deposits.

**Gotcha — Internal transfers:** Since May 2024, internal transfer txIds are prefixed with "Off-chain transfer" instead of the old "internal transfer" flag. This applies retroactively to historical data.

---

### 5. P2P / C2C Trade History

**Purpose:** Your INR on-ramp and off-ramp. Every time you bought crypto with INR or sold crypto for INR via Binance P2P.

```
GET /sapi/v1/c2c/orderMatch/listUserOrderHistory
```

| Param     | Type   | Required | Notes                                        |
| --------- | ------ | -------- | -------------------------------------------- |
| tradeType | STRING | **Yes**  | "BUY" or "SELL" — must query each separately |
| page      | INT    | No       | Default 1                                    |
| rows      | INT    | No       | Default 100                                  |
| timestamp | LONG   | Yes      |                                              |

**Response fields we use:**

```json
{
  "orderNumber": "20219644646554779648",
  "advNo": "11218246497340923904",
  "tradeType": "SELL",
  "asset": "USDT",
  "fiat": "INR",
  "fiatSymbol": "₹",
  "amount": "343.40000000",
  "totalPrice": "2500.00000000",
  "unitPrice": "7.28",
  "orderStatus": "COMPLETED",
  "createTime": 1722997599534,
  "commission": "0",
  "counterPartNickName": "aaa-***",
  "payMethodName": "BANK"
}
```

**Why this matters for ITR:**

- P2P BUY = your acquisition cost in INR (cost basis)
- P2P SELL = your disposal value in INR (taxable event)
- `totalPrice` in INR is what you report on Schedule VDA

**Pagination:** Page-based. Increment `page` until response is empty.

---

### 6. Fiat Order History

**Purpose:** Direct bank deposit/withdrawal (not P2P). Less common in India but still needs tracking.

```
GET /sapi/v1/fiat/orders
```

| Param           | Type | Required | Notes                                  |
| --------------- | ---- | -------- | -------------------------------------- |
| transactionType | INT  | **Yes**  | 0 = deposit (buy), 1 = withdraw (sell) |
| page            | INT  | No       |                                        |
| rows            | INT  | No       | Max 500                                |
| timestamp       | LONG | Yes      |                                        |

**Pagination:** Page-based, query both `transactionType=0` and `transactionType=1`.

---

### 7. Dust Conversions

**Purpose:** When you convert small leftover amounts of various coins to BNB. These create tiny cost basis entries that Koinly typically misses, causing unexplained balance gaps.

```
GET /sapi/v1/asset/dribblet
```

| Param     | Type | Required | Notes |
| --------- | ---- | -------- | ----- |
| startTime | LONG | No       |       |
| endTime   | LONG | No       |       |
| timestamp | LONG | Yes      |       |

**Response structure:** Nested — each `userAssetDribblets` entry contains multiple `userAssetDribbletDetails` (one per coin converted).

**Pagination:** 90-day chunks (same pattern as deposits/withdrawals).

---

### 8. Convert Trade History

**Purpose:** Trades made via Binance's "Convert" feature (simple buy/sell UI). These do NOT appear in `myTrades` — this is the most commonly missed data source and a major reason Koinly gets numbers wrong.

```
GET /sapi/v1/convert/tradeFlow
```

| Param     | Type | Required | Notes                 |
| --------- | ---- | -------- | --------------------- |
| startTime | LONG | **Yes**  |                       |
| endTime   | LONG | **Yes**  | Max 30-day window     |
| limit     | INT  | No       | Default 100, Max 1000 |
| timestamp | LONG | Yes      |                       |

**Response fields:**

```json
{
  "quoteId": "ab12cd",
  "orderId": 123456,
  "orderStatus": "SUCCESS",
  "fromAsset": "USDT",
  "fromAmount": "100.00000000",
  "toAsset": "BNB",
  "toAmount": "0.34500000",
  "ratio": "0.00345",
  "inverseRatio": "289.855",
  "createTime": 1623381330000
}
```

**Pagination:** 30-day chunks (stricter than the 90-day endpoints).

- Walk forward in 29-day chunks from `HISTORY_START` to now
- Within each chunk, if response returns `limit` records, paginate using the last `orderId` as cursor
- Stop when response returns fewer than `limit` records

---

## Symbol Discovery Strategy

The `myTrades` endpoint requires a `symbol` param — you can't request "all trades." The challenge is discovering which symbols you've ever traded, especially coins you fully sold (zero balance now).

**Multi-source discovery pipeline:**

```
Step 1: GET /api/v3/account → extract all assets with balance > 0
Step 2: GET /sapi/v1/capital/deposit/hisrec → extract all deposited coins
Step 3: GET /sapi/v1/capital/withdraw/history → extract all withdrawn coins
Step 4: GET /sapi/v1/convert/tradeFlow → extract all fromAsset and toAsset
Step 5: GET /sapi/v1/asset/dribblet → extract all dust-converted coins
Step 6: Union with MANUAL_COINS list (coins you remember trading)
Step 7: Cross-product with QUOTE_ASSETS → candidate symbol list
Step 8: Validate against GET /api/v3/exchangeInfo → filter to real pairs
Step 9: Query myTrades for each valid pair
```

**MANUAL_COINS list:** For coins that were only spot-traded and fully sold (no deposit/withdrawal/convert record), add them manually:

```python
MANUAL_COINS = {
     "SOL",
  "ETH",
  "TRX",
  "TAO",
  "LINK",
  "FET",
  "ADA",
  "ONDO",
  "MATIC",
  "AVAX",
  "NEAR",
  "AERO",
  "DOGE",
  "RENDER",
  "SUI",
  "AR",
  "SUPER",
  "AKT",
  "TON",
  "PENDLE",
  "XRP",
  "ALGO",
  "PYTH",
  "ATH",
  "SEI",
  "ZK",
  "OCEAN",
  "GALA",
  "ARB",
  "VANRY",
  "APT",
  "JOE",
  "MOG",
  "WMTX",
  "NUM",
  "CPOOL",
  "AGI",
  "INJ",
  "RUNE",
  "MANA",
  "BEAM",
  "SAND",
  "GHX",
  "LUMIA",
  "COQ",
  "ILV",
  "SHIB",
  "WILD",
  "GAME",
  "BRETT",
  "ORN",
  "APE",
  "SUNDOG",
  "HEART",
  "GOAT",
  "CTSI",
  "OP",
  "TAI",
  "IO",
  "PAAL",
  "FOXY",
  "ZEREBRO",
  "EOS",
  "GRIFFAIN",
  "USUAL",
  "SFUND",
  "G3",
  "NTRN",
  "MONKY",
  "SHRAP",
  "MARCO",
  "CWIF",
  "NFT",
  "SOLO",
  "ETHW",
  "LUNA",
  "AI",
  "LEMX",
  "AGIX",
  "PEPE",
  "PUMP"
}
```

**QUOTE_ASSETS to pair against:**

```python
QUOTE_ASSETS = ["USDT", "BTC", "BNB", "ETH", "BUSD", "FDUSD", "USDC", "INR"]
```

---

## Unified Transaction Ledger Schema

Every record from every endpoint gets normalized into this schema before storage:

| Column          | Type      | Description                                                                                                                               | Source                                            |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `id`            | UUID      | Internal primary key                                                                                                                      | Generated                                         |
| `datetime`      | TIMESTAMP | When the event occurred (UTC)                                                                                                             | `time`, `insertTime`, `applyTime`, `createTime`   |
| `type`          | ENUM      | `BUY`, `SELL`, `DEPOSIT`, `WITHDRAWAL`, `P2P_BUY`, `P2P_SELL`, `FIAT_BUY`, `FIAT_SELL`, `DUST_CONVERSION`, `CONVERT`, `REWARD`, `INTERNAL_TRANSFER`, `UNKNOWN` | Derived                                           |
| `asset`         | VARCHAR   | The primary coin                                                                                                                          | `coin`, `asset`, `symbol` (parsed)                |
| `amount`        | DECIMAL   | Quantity of the primary coin                                                                                                              | `qty`, `amount`                                   |
| `fee`           | DECIMAL   | Fee paid                                                                                                                                  | `commission`, `transactionFee`                    |
| `fee_asset`     | VARCHAR   | Currency of the fee                                                                                                                       | `commissionAsset`, same as `coin`                 |
| `price`         | DECIMAL   | Unit price (in counter asset)                                                                                                             | `price`, `unitPrice`, `ratio`                     |
| `quote_amount`  | DECIMAL   | Total value in counter asset                                                                                                              | `quoteQty`, `totalPrice`, `fromAmount`/`toAmount` |
| `counter_asset` | VARCHAR   | The quote/fiat currency                                                                                                                   | Parsed from symbol, `fiat`, `fromAsset`/`toAsset` |
| `txhash`        | VARCHAR   | On-chain Transaction Hash                                                                                                                 | `txId` — **THE KEY FIELD**                        |
| `network`       | VARCHAR   | Blockchain network                                                                                                                        | `network`                                         |
| `address`       | VARCHAR   | Wallet address involved                                                                                                                   | `address`, `sourceAddress`                        |
| `source_wallet` | VARCHAR   | Where coins came from                                                                                                                     | Derived from context                              |
| `dest_wallet`   | VARCHAR   | Where coins went to                                                                                                                       | Derived from context                              |
| `transfer_type` | INT       | 0=external, 1=internal                                                                                                                    | `transferType`                                    |
| `source`        | VARCHAR   | Which endpoint provided this                                                                                                              | `spot_trade`, `deposit`, `withdrawal`, etc.       |
| `exchange`      | VARCHAR   | Always "binance" for this module                                                                                                          | Hardcoded                                         |
| `binance_id`    | VARCHAR   | Binance's internal ID                                                                                                                     | `id`, `orderNumber`, `orderId`                    |
| `order_id`      | VARCHAR   | Associated order                                                                                                                          | `orderId`, `advNo`                                |
| `status`        | VARCHAR   | Completion status                                                                                                                         | `status`, `orderStatus`                           |
| `raw_json`      | JSONB     | Full original API response                                                                                                                | For debugging/audit                               |
| `created_at`    | TIMESTAMP | When we ingested this record                                                                                                              | Generated                                         |

---

## Transfer Matching Engine

This is the core differentiator over Koinly. After ingesting all data, run the matching algorithm:

**Match signature:** A transfer between your own wallets has this fingerprint:

- One WITHDRAWAL record + one DEPOSIT record
- Same `asset` (coin)
- Amount difference ≤ network gas fee (withdrawal `amount` - deposit `amount` ≈ withdrawal `transactionFee`)
- Timestamp difference ≤ 30 minutes (configurable)
- OR: same `txHash` appears in both records (strongest match)

**Matching priority:**

1. **Exact TxHash match** (withdrawal txId == deposit txId) → confidence 100%
2. **Same asset + amount within fee tolerance + timestamp within 30min** → confidence 90%
3. **Same asset + approximate amount + timestamp within 2 hours** → confidence 70%
4. **Unmatched** → flag for manual review

**What matching produces:**

- Matched pairs get linked as `INTERNAL_TRANSFER` — NOT a taxable event
- Cost basis carries forward from source wallet to destination wallet
- Unmatched deposits without a corresponding withdrawal → potentially external income (airdrop, reward, payment received)
- Unmatched withdrawals without a corresponding deposit → potentially sent to someone else, or to a wallet we haven't imported yet

---

## Cost Basis Calculation (Indian VDA Rules)

**Tax regime:** Section 115BBH — 30% flat on gains, no loss offset across assets, FIFO within each asset.

**Calculation logic:**

1. For each asset, maintain a FIFO queue of acquisition lots: `(datetime, quantity, cost_per_unit_inr, source)`
2. Acquisition events: P2P_BUY, FIAT_BUY, CONVERT (to-side), DEPOSIT (only if it's an external acquisition, not internal transfer)
3. Disposal events: P2P_SELL, FIAT_SELL, CONVERT (from-side), WITHDRAWAL (only if sent externally)
4. Internal transfers: NOT a disposal — just move the lot from one wallet label to another
5. Dust conversions: disposal of the source coin, acquisition of BNB
6. For each disposal, dequeue lots FIFO and compute: `gain = disposal_value_inr - cost_basis_inr`

**INR price source:** P2P trades give direct INR prices. For spot trades (e.g., DOGE/USDT), chain the price: DOGE→USDT rate × USDT→INR rate (from closest P2P trade or CoinGecko historical price API).

---

## Edge Cases & Known Gotchas

1. **Internal transfer txId prefix changed** (May 2024): Binance replaced "internal transfer" with "Off-chain transfer" prefix in txId for Binance-to-Binance transfers. This is retroactive — historical data also changed.

2. **Convert trades missing from myTrades:** The Binance Convert feature (simple buy/sell) uses a completely separate order book. If you bought BNB using the Convert UI, it only appears in `/sapi/v1/convert/tradeFlow`, never in `/api/v3/myTrades`.

3. **Dust conversions create phantom balances:** Converting 0.003 DOGE to BNB is a disposal of DOGE and acquisition of BNB. If not tracked, your DOGE balance in the ledger will be 0.003 too high and BNB will be short.

4. **BUSD delisting:** Binance delisted BUSD. Historical trades in BUSD pairs still exist but BUSD is no longer a valid trading pair. The script handles this via `fromId` pagination (no need for the pair to currently be active).

5. **Multiple wallet types:** Binance has Spot, Funding, Earn, and Margin wallets. Deposits/withdrawals can target different wallet types (`walletType` field). Internal transfers between these wallets (e.g., Spot→Funding) use `/sapi/v1/asset/transfer` — a separate endpoint to add later.

6. **Rate limits:**
   - Spot endpoints: IP-based weight limits (1200 weight/minute)
   - Wallet endpoints: Some are UID-based (e.g., withdraw history: 18000 weight, max 10 req/sec)
   - Build in 150ms delay between calls + exponential backoff on 429 responses

7. **Timestamp synchronization:** Binance rejects requests where the timestamp differs from server time by more than `recvWindow` (default 5000ms). If your machine clock is off, fetch server time first: `GET /api/v3/time`.

---

## Implementation Checklist

### Phase 1 — Raw Extraction (Current)

- [x] HMAC-SHA256 signing with timestamp
- [x] Account balances endpoint
- [x] Spot trades with fromId pagination
- [x] Deposit history with 90-day chunking and includeSource
- [x] Withdrawal history with 90-day chunking
- [x] P2P/C2C trade history (both BUY and SELL)
- [x] Fiat order history
- [x] Dust conversion log
- [ ] Convert trade flow (30-day chunks)
- [ ] Internal wallet transfers (`/sapi/v1/asset/transfer`)
- [x] Symbol discovery from balances + deposits + withdrawals
- [x] MANUAL_COINS fallback for fully-sold spot-only coins
- [x] Unified master ledger CSV export

### Phase 2 — Storage & Reconciliation

- [ ] PostgreSQL schema creation (Supabase)
- [ ] Idempotent upsert (deduplicate on `exchange + binance_id + source`)
- [ ] Transfer matching engine (TxHash match → amount+time match → flag)
- [ ] Confidence scoring on matches
- [ ] Manual review queue for unmatched records
- [ ] Cross-reference with Koinly export CSV

### Phase 3 — Cost Basis & Tax

- [ ] FIFO lot tracking per asset
- [ ] INR price resolution (P2P direct, CoinGecko fallback)
- [ ] Section 115BBH gain/loss calculation
- [ ] Schedule VDA output format
- [ ] TDS tracking (Section 194S, 1% TDS on transfers > ₹10K)

### Phase 4 — Visualization

- [ ] Transaction flow graph (mind map / expanding tree)
- [ ] Per-asset P&L timeline
- [ ] Wallet-to-wallet flow diagram
- [ ] ITR-ready audit trail export

---

## File Structure

See `architecture.md` for the canonical project directory layout.

---

## API Documentation References

- Spot Account Endpoints: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints
- Wallet/Capital (Deposit): https://developers.binance.com/docs/wallet/capital/deposite-history
- Wallet/Capital (Withdrawal): https://developers.binance.com/docs/wallet/capital/withdraw-history
- C2C/P2P: https://developers.binance.com/docs/c2c/rest-api
- Convert: https://developers.binance.com/docs/convert/rest-api
- Wallet Change Log: https://developers.binance.com/docs/wallet/change-log
- python-binance (community SDK): https://github.com/sammchardy/python-binance
