import { useState, useEffect, useMemo } from 'react'
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import WalletNode from '../components/WalletNode'
import ActionNode from '../components/ActionNode'
import YearFilter, { allYears } from '../components/YearFilter'
import { getGraphOverview } from '../api/client'
import { Network, Loader2, Inbox } from 'lucide-react'

const nodeTypes = {
  wallet: WalletNode,
  action: ActionNode,
}

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
  },
}

const minimapStyle = { height: 100, width: 160 }
const proOptions = { hideAttribution: true }

export default function FlowGraph({ exchange, exchangeLabel }) {
  const [selectedYears, setSelectedYears] = useState(() => allYears)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setNodes([])
    setEdges([])
    async function fetchGraph() {
      setLoading(true)
      try {
        const data = await getGraphOverview(selectedYears[0])
        if (!cancelled && data && data.nodes && data.nodes.length > 0) {
          setNodes(data.nodes)
          setEdges(data.edges)
        }
      } catch {
        // no data
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchGraph()
    return () => { cancelled = true }
  }, [selectedYears, exchange])

  const edgesWithDefaults = useMemo(
    () =>
      edges.map((edge) => ({
        ...defaultEdgeOptions,
        ...edge,
        markerEnd: {
          ...defaultEdgeOptions.markerEnd,
          color: edge.style?.stroke || '#94a3b8',
        },
        labelStyle: {
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          fill: '#64748b',
        },
        labelBgStyle: { fill: 'white', fillOpacity: 0.92 },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 6,
      })),
    [edges]
  )

  const walletCount = nodes.filter((n) => n.type === 'wallet').length
  const actionCount = nodes.filter((n) => n.type === 'action').length
  const yearLabel = selectedYears.length === 1 ? `FY ${selectedYears[0]}` : `${selectedYears.length} years`

  if (nodes.length === 0 && !loading) {
    return (
      <div style={{
        width: '100%', height: '100%', background: '#f8fafc',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header with year filter */}
        <div style={{ padding: '24px 32px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
          }}>
            <Network size={20} color="#fff" strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Portfolio Flow Map</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              <span style={{ color: '#6366f1', fontWeight: 600 }}>{exchangeLabel}</span> · {yearLabel}
            </p>
          </div>
          <YearFilter selectedYears={selectedYears} onChange={setSelectedYears} />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <Inbox size={40} style={{ color: '#cbd5e1', marginBottom: 16 }} strokeWidth={1.5} />
            <p style={{ fontSize: 16, fontWeight: 600, color: '#475569', margin: 0 }}>No data available</p>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
              Sync <span style={{ color: '#6366f1', fontWeight: 600 }}>{exchangeLabel}</span> for {yearLabel} to see the flow map
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 px-8 py-6 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, #f8fafc 60%, transparent)' }}>
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              <Network className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-[18px] font-bold" style={{ color: '#0f172a', letterSpacing: '-0.02em' }}>
                Portfolio Flow Map
              </h2>
              <p className="text-[12px] mt-1" style={{ color: '#94a3b8' }}>
                <span style={{ color: '#6366f1', fontWeight: 600 }}>{exchangeLabel}</span>
                {' · '}{yearLabel} — {walletCount} wallets · {actionCount} actions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <YearFilter selectedYears={selectedYears} onChange={setSelectedYears} />

            {/* Legend */}
            <div className="flex items-center gap-5 px-5 py-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              {[
                { color: '#34d399', label: 'Source' },
                { color: '#60a5fa', label: 'Exchange' },
                { color: '#fbbf24', label: 'External' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}50` }} />
                  <span className="text-[11px] font-medium" style={{ color: '#64748b' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-20"
          style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#6366f1' }} strokeWidth={2} />
            <span className="text-[13px] font-medium" style={{ color: '#64748b' }}>Loading flow graph...</span>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edgesWithDefaults}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={proOptions}
        style={{ background: '#f8fafc' }}
      >
        <Background color="#e2e8f0" gap={24} size={1} />
        <Controls
          showInteractive={false}
          position="bottom-left"
          style={{ marginBottom: 16, marginLeft: 16 }}
        />
        <MiniMap
          style={minimapStyle}
          nodeColor={(node) => {
            if (node.type === 'action') return '#e2e8f0'
            const variant = node.data?.variant
            if (variant === 'source') return '#6ee7b7'
            if (variant === 'exchange') return '#93c5fd'
            if (variant === 'external') return '#fcd34d'
            return '#e2e8f0'
          }}
          maskColor="rgba(0, 0, 0, 0.04)"
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  )
}
