// ── Mock Flow Graph Data ──────────────────────────────────────────────
// Represents a realistic crypto portfolio journey for FY 2024-25:
// INR -> P2P Buy USDT -> Spot Trading -> Conversions -> Withdrawals

export const mockNodes = [
  // Source: INR Bank
  {
    id: 'bank',
    type: 'wallet',
    position: { x: 0, y: 280 },
    data: {
      label: 'Bank Account',
      subtitle: 'INR Fiat',
      icon: 'landmark',
      assets: [{ symbol: 'INR', amount: '5,00,000' }],
      variant: 'source',
    },
  },

  // Action: P2P Buy
  {
    id: 'p2p-buy',
    type: 'action',
    position: { x: 250, y: 300 },
    data: { label: 'P2P Buy', actionType: 'BUY' },
  },

  // Binance P2P Wallet
  {
    id: 'binance-p2p',
    type: 'wallet',
    position: { x: 480, y: 260 },
    data: {
      label: 'Binance P2P',
      subtitle: 'P2P Wallet',
      icon: 'wallet',
      assets: [{ symbol: 'USDT', amount: '5,850' }],
      variant: 'exchange',
    },
  },

  // Action: Internal Transfer
  {
    id: 'transfer-spot',
    type: 'action',
    position: { x: 700, y: 280 },
    data: { label: 'Transfer', actionType: 'INTERNAL_TRANSFER' },
  },

  // Binance Spot
  {
    id: 'binance-spot',
    type: 'wallet',
    position: { x: 920, y: 200 },
    data: {
      label: 'Binance Spot',
      subtitle: 'Trading Wallet',
      icon: 'candlestick-chart',
      assets: [
        { symbol: 'BTC', amount: '0.082' },
        { symbol: 'ETH', amount: '1.45' },
        { symbol: 'SOL', amount: '24.5' },
        { symbol: 'USDT', amount: '320' },
      ],
      variant: 'exchange',
    },
  },

  // Action: Buy BTC
  {
    id: 'buy-btc',
    type: 'action',
    position: { x: 700, y: 120 },
    data: { label: 'Buy BTC', actionType: 'BUY' },
  },

  // Action: Buy ETH
  {
    id: 'buy-eth',
    type: 'action',
    position: { x: 700, y: 200 },
    data: { label: 'Buy ETH', actionType: 'BUY' },
  },

  // Action: Buy SOL
  {
    id: 'buy-sol',
    type: 'action',
    position: { x: 700, y: 440 },
    data: { label: 'Buy SOL', actionType: 'BUY' },
  },

  // Action: Convert ETH -> SOL
  {
    id: 'convert-eth-sol',
    type: 'action',
    position: { x: 1160, y: 340 },
    data: { label: 'Convert', actionType: 'CONVERT' },
  },

  // Action: Withdraw BTC
  {
    id: 'withdraw-btc',
    type: 'action',
    position: { x: 1160, y: 120 },
    data: { label: 'Withdraw', actionType: 'WITHDRAWAL' },
  },

  // Action: Withdraw SOL
  {
    id: 'withdraw-sol',
    type: 'action',
    position: { x: 1160, y: 460 },
    data: { label: 'Withdraw', actionType: 'WITHDRAWAL' },
  },

  // External BTC Wallet
  {
    id: 'ext-btc',
    type: 'wallet',
    position: { x: 1400, y: 80 },
    data: {
      label: 'Ledger Nano',
      subtitle: 'Cold Wallet',
      icon: 'hard-drive',
      assets: [{ symbol: 'BTC', amount: '0.05' }],
      variant: 'external',
    },
  },

  // External SOL Wallet
  {
    id: 'ext-sol',
    type: 'wallet',
    position: { x: 1400, y: 400 },
    data: {
      label: 'Phantom Wallet',
      subtitle: 'Hot Wallet',
      icon: 'ghost',
      assets: [{ symbol: 'SOL', amount: '12.0' }],
      variant: 'external',
    },
  },

  // Action: Sell some ETH
  {
    id: 'sell-eth',
    type: 'action',
    position: { x: 1160, y: 220 },
    data: { label: 'Sell ETH', actionType: 'SELL' },
  },

  // INR received from sale
  {
    id: 'bank-receive',
    type: 'wallet',
    position: { x: 1400, y: 220 },
    data: {
      label: 'Bank Account',
      subtitle: 'INR Received',
      icon: 'landmark',
      assets: [{ symbol: 'INR', amount: '45,200' }],
      variant: 'source',
    },
  },

  // Dust conversion
  {
    id: 'dust',
    type: 'action',
    position: { x: 1160, y: 560 },
    data: { label: 'Dust Convert', actionType: 'DUST' },
  },
]

const edgeDefaults = {
  animated: true,
  style: { strokeWidth: 2 },
}

const greenEdge = { ...edgeDefaults, style: { ...edgeDefaults.style, stroke: '#10b981' } }
const redEdge = { ...edgeDefaults, style: { ...edgeDefaults.style, stroke: '#f43f5e' } }
const blueEdge = { ...edgeDefaults, style: { ...edgeDefaults.style, stroke: '#3b82f6' } }
const amberEdge = { ...edgeDefaults, style: { ...edgeDefaults.style, stroke: '#f59e0b' } }
const violetEdge = { ...edgeDefaults, style: { ...edgeDefaults.style, stroke: '#8b5cf6' } }
const grayEdge = { ...edgeDefaults, style: { ...edgeDefaults.style, stroke: '#9ca3af' } }

export const mockEdges = [
  // INR -> P2P Buy
  {
    id: 'e-bank-p2p',
    source: 'bank',
    target: 'p2p-buy',
    label: '5,00,000 INR',
    ...greenEdge,
  },
  // P2P Buy -> Binance P2P
  {
    id: 'e-p2p-wallet',
    source: 'p2p-buy',
    target: 'binance-p2p',
    label: '5,850 USDT',
    ...greenEdge,
  },
  // Binance P2P -> Transfer to Spot
  {
    id: 'e-p2p-transfer',
    source: 'binance-p2p',
    target: 'transfer-spot',
    label: '5,850 USDT',
    ...blueEdge,
  },
  // Transfer -> Binance Spot
  {
    id: 'e-transfer-spot',
    source: 'transfer-spot',
    target: 'binance-spot',
    label: '5,850 USDT',
    ...blueEdge,
  },

  // Spot -> Buy BTC (from USDT pool)
  {
    id: 'e-spot-buybtc',
    source: 'binance-spot',
    target: 'buy-btc',
    label: '2,400 USDT',
    ...greenEdge,
  },
  // Buy BTC -> back to Spot
  {
    id: 'e-buybtc-spot',
    source: 'buy-btc',
    target: 'binance-spot',
    label: '0.082 BTC',
    ...greenEdge,
  },

  // Spot -> Buy ETH
  {
    id: 'e-spot-buyeth',
    source: 'binance-spot',
    target: 'buy-eth',
    label: '1,800 USDT',
    ...greenEdge,
  },
  {
    id: 'e-buyeth-spot',
    source: 'buy-eth',
    target: 'binance-spot',
    label: '1.45 ETH',
    ...greenEdge,
  },

  // Spot -> Buy SOL
  {
    id: 'e-spot-buysol',
    source: 'binance-spot',
    target: 'buy-sol',
    label: '1,200 USDT',
    ...greenEdge,
  },
  {
    id: 'e-buysol-spot',
    source: 'buy-sol',
    target: 'binance-spot',
    label: '24.5 SOL',
    ...greenEdge,
  },

  // Spot -> Convert ETH to SOL
  {
    id: 'e-spot-convert',
    source: 'binance-spot',
    target: 'convert-eth-sol',
    label: '0.5 ETH',
    ...violetEdge,
  },
  {
    id: 'e-convert-spot',
    source: 'convert-eth-sol',
    target: 'binance-spot',
    label: '8.2 SOL',
    ...violetEdge,
  },

  // Spot -> Withdraw BTC
  {
    id: 'e-spot-wbtc',
    source: 'binance-spot',
    target: 'withdraw-btc',
    label: '0.05 BTC',
    ...amberEdge,
  },
  {
    id: 'e-wbtc-ext',
    source: 'withdraw-btc',
    target: 'ext-btc',
    label: '0.05 BTC',
    ...amberEdge,
  },

  // Spot -> Withdraw SOL
  {
    id: 'e-spot-wsol',
    source: 'binance-spot',
    target: 'withdraw-sol',
    label: '12.0 SOL',
    ...amberEdge,
  },
  {
    id: 'e-wsol-ext',
    source: 'withdraw-sol',
    target: 'ext-sol',
    label: '12.0 SOL',
    ...amberEdge,
  },

  // Spot -> Sell ETH
  {
    id: 'e-spot-selleth',
    source: 'binance-spot',
    target: 'sell-eth',
    label: '0.35 ETH',
    ...redEdge,
  },
  {
    id: 'e-selleth-bank',
    source: 'sell-eth',
    target: 'bank-receive',
    label: '45,200 INR',
    ...redEdge,
  },

  // Spot -> Dust
  {
    id: 'e-spot-dust',
    source: 'binance-spot',
    target: 'dust',
    label: 'Small balances',
    ...grayEdge,
  },
]

// ── Mock Transactions ─────────────────────────────────────────────────

export const mockTransactions = [
  {
    id: 1,
    date: '2024-04-15T10:30:00',
    type: 'P2P_BUY',
    asset: 'USDT',
    amount: '2000.00',
    price: '85.50',
    value: '171000.00',
    fee: '0.00',
    source: 'Binance P2P',
    txHash: '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  },
  {
    id: 2,
    date: '2024-04-15T11:00:00',
    type: 'INTERNAL_TRANSFER',
    asset: 'USDT',
    amount: '2000.00',
    price: '85.50',
    value: '171000.00',
    fee: '0.00',
    source: 'P2P -> Spot',
    txHash: '',
  },
  {
    id: 3,
    date: '2024-04-16T09:15:00',
    type: 'BUY',
    asset: 'BTC',
    amount: '0.035',
    price: '64250.00',
    value: '2248.75',
    fee: '2.25',
    source: 'Binance Spot',
    txHash: '0xf1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0',
  },
  {
    id: 4,
    date: '2024-05-02T14:22:00',
    type: 'BUY',
    asset: 'ETH',
    amount: '0.85',
    price: '3120.00',
    value: '2652.00',
    fee: '2.65',
    source: 'Binance Spot',
    txHash: '0x1234567890abcdef1234567890abcdef12345678',
  },
  {
    id: 5,
    date: '2024-05-10T16:45:00',
    type: 'P2P_BUY',
    asset: 'USDT',
    amount: '3850.00',
    price: '85.20',
    value: '328020.00',
    fee: '0.00',
    source: 'Binance P2P',
    txHash: '0xabcdef1234567890abcdef1234567890abcdef12',
  },
  {
    id: 6,
    date: '2024-05-12T08:30:00',
    type: 'BUY',
    asset: 'SOL',
    amount: '24.5',
    price: '148.00',
    value: '3626.00',
    fee: '3.63',
    source: 'Binance Spot',
    txHash: '0x9876543210fedcba9876543210fedcba98765432',
  },
  {
    id: 7,
    date: '2024-06-01T11:20:00',
    type: 'BUY',
    asset: 'BTC',
    amount: '0.047',
    price: '67800.00',
    value: '3186.60',
    fee: '3.19',
    source: 'Binance Spot',
    txHash: '0xdeadbeef12345678deadbeef12345678deadbeef',
  },
  {
    id: 8,
    date: '2024-07-15T13:10:00',
    type: 'CONVERT',
    asset: 'ETH',
    amount: '0.50',
    price: '3450.00',
    value: '1725.00',
    fee: '0.86',
    source: 'ETH -> SOL',
    txHash: '0xcafebabe12345678cafebabe12345678cafebabe',
  },
  {
    id: 9,
    date: '2024-08-20T15:30:00',
    type: 'WITHDRAWAL',
    asset: 'BTC',
    amount: '0.050',
    price: '59200.00',
    value: '2960.00',
    fee: '0.0005',
    source: 'Ledger Nano',
    txHash: '0x1111222233334444555566667777888899990000',
  },
  {
    id: 10,
    date: '2024-09-05T10:00:00',
    type: 'WITHDRAWAL',
    asset: 'SOL',
    amount: '12.00',
    price: '135.00',
    value: '1620.00',
    fee: '0.01',
    source: 'Phantom Wallet',
    txHash: '0xaaaabbbbccccddddeeeeffffaaaabbbbccccdddd',
  },
  {
    id: 11,
    date: '2024-10-12T09:45:00',
    type: 'SELL',
    asset: 'ETH',
    amount: '0.35',
    price: '2580.00',
    value: '903.00',
    fee: '0.90',
    source: 'Binance Spot',
    txHash: '0x5555666677778888999900001111222233334444',
  },
  {
    id: 12,
    date: '2024-10-12T10:00:00',
    type: 'P2P_SELL',
    asset: 'USDT',
    amount: '903.00',
    price: '85.10',
    value: '76843.30',
    fee: '0.00',
    source: 'Binance P2P',
    txHash: '0xeeeeffffaaaabbbbccccddddeeeeffffaaaabbbb',
  },
  {
    id: 13,
    date: '2024-11-01T12:00:00',
    type: 'DUST',
    asset: 'SHIB',
    amount: '15234.00',
    price: '0.000012',
    value: '0.18',
    fee: '0.00',
    source: 'Dust -> BNB',
    txHash: '',
  },
  {
    id: 14,
    date: '2024-12-15T14:30:00',
    type: 'DEPOSIT',
    asset: 'USDT',
    amount: '500.00',
    price: '85.00',
    value: '42500.00',
    fee: '0.00',
    source: 'External Deposit',
    txHash: '0x7777888899990000aaaabbbbccccddddeeeeeeee',
  },
  {
    id: 15,
    date: '2025-01-10T08:15:00',
    type: 'BUY',
    asset: 'ETH',
    amount: '0.60',
    price: '3380.00',
    value: '2028.00',
    fee: '2.03',
    source: 'Binance Spot',
    txHash: '0xfedcba9876543210fedcba9876543210fedcba98',
  },
  {
    id: 16,
    date: '2025-02-20T16:00:00',
    type: 'CONVERT',
    asset: 'BNB',
    amount: '0.12',
    price: '620.00',
    value: '74.40',
    fee: '0.00',
    source: 'Dust BNB -> USDT',
    txHash: '',
  },
]

export const mockFinancialYears = [
  { fy: '2026-27', count: 0 },
  { fy: '2025-26', count: 0 },
  { fy: '2024-25', count: 156 },
  { fy: '2023-24', count: 89 },
  { fy: '2022-23', count: 234 },
  { fy: '2021-22', count: 45 },
  { fy: '2020-21', count: 12 },
]

export const mockHoldings = [
  { asset: 'BTC', amount: '0.032', valueUSD: '2073.60', valuePnl: '+12.4%' },
  { asset: 'ETH', amount: '1.25', valueUSD: '4225.00', valuePnl: '+8.2%' },
  { asset: 'SOL', amount: '20.7', valueUSD: '2898.00', valuePnl: '+22.1%' },
  { asset: 'USDT', amount: '320.00', valueUSD: '320.00', valuePnl: '0.0%' },
]
