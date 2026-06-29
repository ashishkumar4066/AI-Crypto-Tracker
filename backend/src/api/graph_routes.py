"""
GET /api/v1/graph/overview       -- full coin-flow overview (React Flow format)
GET /api/v1/graph/asset/{asset}  -- per-asset flow graph

Nodes match the frontend WalletNode and ActionNode components exactly:
  WalletNode expects: {label, subtitle, icon, variant, assets: [{symbol, amount}]}
  ActionNode expects: {label, actionType}
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.config import FY_DATE_RANGES
from src.db.database import get_db
from src.db.models import Transaction
from src.exchanges.binance.wallets import (
    WALLET_META,
    ACTION_TYPE_MAP,
    ACTION_LABELS,
    COL_ORDER,
    wallet_id as _wallet_id,
    get_wallet_meta as _wallet_meta,
    edge_color as _edge_color,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt(val: float) -> str:
    if val >= 1_000:
        return f"{val:,.2f}"
    if val >= 1:
        return f"{val:.4f}"
    if val >= 0.0001:
        return f"{val:.6f}"
    return f"{val:.8f}"


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def _build_graph(transactions: list[Transaction]) -> dict:
    """
    Build a React Flow graph dict from transaction ORM objects.

    Strategy:
    - Each unique wallet becomes a WalletNode.
    - Transactions between different wallets get grouped into action nodes.
    - Self-loop transactions (source == dest, e.g. dust) route through an
      intermediate action node to a virtual result node, so there are no
      self-referencing edges.
    """
    # Step 1: Group transactions into flows
    # flow_key = (txn_type, src_wallet_id, dst_wallet_id)
    flows: dict[tuple[str, str, str], list[Transaction]] = defaultdict(list)
    wallet_raw_names: dict[str, str] = {}

    for txn in transactions:
        src_raw = txn.source_wallet or "unknown"
        dst_raw = txn.dest_wallet or "unknown"
        src_id = _wallet_id(src_raw)
        dst_id = _wallet_id(dst_raw)
        wallet_raw_names.setdefault(src_id, src_raw)
        wallet_raw_names.setdefault(dst_id, dst_raw)

        txn_type = txn.type or "UNKNOWN"

        if txn_type in ("P2P_BUY", "FIAT_BUY"):
            wallet_raw_names.setdefault("inr_entry", "inr_entry")
            flows[("P2P_BUY", "inr_entry", dst_id)].append(txn)

        elif txn_type in ("P2P_SELL", "FIAT_SELL"):
            wallet_raw_names.setdefault("inr_entry", "inr_entry")
            flows[("P2P_SELL", src_id, "inr_entry")].append(txn)

        elif src_id == dst_id:
            # Self-loop: create a virtual result node
            result_id = f"{dst_id}_result"
            wallet_raw_names.setdefault(result_id, dst_raw)
            flows[(txn_type, src_id, result_id)].append(txn)

        else:
            flows[(txn_type, src_id, dst_id)].append(txn)

    # Step 2: Build wallet nodes with aggregated asset lists
    wallet_assets: dict[str, dict[str, float]] = defaultdict(
        lambda: defaultdict(float)
    )

    for (txn_type, src_id, dst_id), txns in flows.items():
        for txn in txns:
            asset = txn.asset or "?"
            amount = txn.amount or 0

            if txn_type in ("P2P_BUY", "FIAT_BUY"):
                wallet_assets["inr_entry"]["INR"] += txn.quote_amount or 0
                wallet_assets[dst_id][asset] += amount
            elif txn_type in ("P2P_SELL", "FIAT_SELL"):
                wallet_assets[src_id][asset] += amount
                wallet_assets["inr_entry"]["INR"] += txn.quote_amount or 0
            elif txn_type == "DUST_CONVERSION":
                wallet_assets[src_id][asset] += amount
                wallet_assets[dst_id]["BNB"] += txn.quote_amount or 0
            elif txn_type == "CONVERT":
                wallet_assets[src_id][txn.counter_asset or asset] += (
                    txn.quote_amount or amount
                )
                wallet_assets[dst_id][asset] += amount
            else:
                wallet_assets[src_id][asset] += amount
                wallet_assets[dst_id][asset] += amount

    # Step 3: Assign positions (column-based layout, left to right)
    # Determine column for each wallet based on role
    # All regular exchange wallets
    _EXCHANGE_COL = 2
    # Result/external wallets
    _RESULT_COL = 4

    def _col(wid: str) -> int:
        if wid in COL_ORDER:
            return COL_ORDER[wid]
        if wid.endswith("_result"):
            return _RESULT_COL
        if wid.startswith("ext_"):
            return _RESULT_COL
        return _EXCHANGE_COL

    COL_X = {0: 0, 1: 320, 2: 640, 3: 960, 4: 1280}
    col_y_counters: dict[int, int] = defaultdict(int)

    nodes: list[dict[str, Any]] = []
    node_ids: set[str] = set()

    all_wallet_ids = set()
    for src_id, dst_id in [(s, d) for (_, s, d) in flows.keys()]:
        all_wallet_ids.add(src_id)
        all_wallet_ids.add(dst_id)

    for wid in sorted(all_wallet_ids, key=lambda w: (_col(w), w)):
        meta = _wallet_meta(wid, wallet_raw_names.get(wid, wid))

        # For result nodes, customize the label
        if wid.endswith("_result"):
            base = wid.replace("_result", "")
            base_meta = _wallet_meta(base, wallet_raw_names.get(base, base))
            meta["label"] = base_meta["label"]
            meta["subtitle"] = "Received"
            meta["icon"] = base_meta["icon"]
            meta["variant"] = base_meta["variant"]

        raw_assets = wallet_assets.get(wid, {})
        sorted_assets = sorted(
            raw_assets.items(), key=lambda x: -x[1]
        )
        asset_list = [
            {"symbol": sym, "amount": _fmt(amt)}
            for sym, amt in sorted_assets
            if amt > 1e-12
        ]
        if len(asset_list) > 8:
            extra = len(asset_list) - 7
            asset_list = asset_list[:7]
            asset_list.append({"symbol": "...", "amount": f"+{extra} more"})

        col = _col(wid)
        row = col_y_counters[col]
        col_y_counters[col] += 1

        nodes.append(
            {
                "id": wid,
                "type": "wallet",
                "data": {
                    "label": meta["label"],
                    "subtitle": meta["subtitle"],
                    "icon": meta["icon"],
                    "variant": meta["variant"],
                    "assets": asset_list,
                },
                "position": {"x": COL_X.get(col, col * 320), "y": row * 220},
            }
        )
        node_ids.add(wid)

    # Step 4: Build action nodes and edges
    edges: list[dict[str, Any]] = []
    action_col = 3  # action nodes go in column 3
    action_y = 0

    for (txn_type, src_id, dst_id), txns in flows.items():
        action_id = f"act_{txn_type}_{src_id}_{dst_id}"
        label_text = ACTION_LABELS.get(txn_type, txn_type.replace("_", " ").title())
        action_type_key = ACTION_TYPE_MAP.get(txn_type, txn_type)

        # Aggregate: total amount and distinct assets
        total_amount = sum(t.amount or 0 for t in txns)
        assets_in_flow = sorted(set(t.asset or "?" for t in txns))
        count = len(txns)

        if count > 1 and len(assets_in_flow) > 1:
            label_text = f"{label_text} ({count})"
        elif count == 1 and len(assets_in_flow) == 1:
            label_text = f"{label_text} {assets_in_flow[0]}"

        # Position action node between source and dest columns
        src_col = _col(src_id)
        dst_col = _col(dst_id)
        act_x = (COL_X.get(src_col, 0) + COL_X.get(dst_col, 640)) // 2
        act_y = action_y * 140
        action_y += 1

        nodes.append(
            {
                "id": action_id,
                "type": "action",
                "data": {
                    "label": label_text,
                    "actionType": action_type_key,
                },
                "position": {"x": act_x, "y": act_y},
            }
        )

        # Edge: source -> action
        edge_label_in = (
            f"{_fmt(total_amount)} {assets_in_flow[0]}"
            if len(assets_in_flow) == 1
            else f"{count} assets"
        )
        edges.append(
            {
                "id": f"e_{src_id}_{action_id}",
                "source": src_id,
                "target": action_id,
                "label": edge_label_in,
                "animated": True,
                "style": {"strokeWidth": 2, "stroke": _edge_color(txn_type, "out")},
            }
        )

        # Edge: action -> dest
        if txn_type == "DUST_CONVERSION":
            total_bnb = sum(t.quote_amount or 0 for t in txns)
            edge_label_out = f"{_fmt(total_bnb)} BNB"
        elif txn_type in ("P2P_BUY", "FIAT_BUY"):
            edge_label_out = edge_label_in
        elif txn_type in ("P2P_SELL", "FIAT_SELL"):
            total_inr = sum(t.quote_amount or 0 for t in txns)
            edge_label_out = f"{_fmt(total_inr)} INR"
        else:
            edge_label_out = edge_label_in

        edges.append(
            {
                "id": f"e_{action_id}_{dst_id}",
                "source": action_id,
                "target": dst_id,
                "label": edge_label_out,
                "animated": True,
                "style": {"strokeWidth": 2, "stroke": _edge_color(txn_type, "in")},
            }
        )

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/graph/overview")
def graph_overview(
    fy: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if fy and fy in FY_DATE_RANGES:
        start_dt, end_dt = FY_DATE_RANGES[fy]
        q = q.filter(
            Transaction.datetime >= start_dt.isoformat(),
            Transaction.datetime <= end_dt.isoformat(),
        )
    txns = q.all()
    return _build_graph(txns)


@router.get("/graph/asset/{asset}")
def graph_for_asset(
    asset: str,
    fy: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(Transaction.asset == asset.upper())
    if fy and fy in FY_DATE_RANGES:
        start_dt, end_dt = FY_DATE_RANGES[fy]
        q = q.filter(
            Transaction.datetime >= start_dt.isoformat(),
            Transaction.datetime <= end_dt.isoformat(),
        )
    txns = q.all()
    return _build_graph(txns)
