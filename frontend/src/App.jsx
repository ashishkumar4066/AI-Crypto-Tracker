import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import FlowGraph from './pages/FlowGraph'
import Transactions from './pages/Transactions'
import Tally from './pages/Tally'

function App() {
  const [currentView, setCurrentView] = useState('transactions')
  const [selectedExchange, setSelectedExchange] = useState('binance')

  const handleNavigate = useCallback((exchange, view) => {
    setSelectedExchange(exchange)
    setCurrentView(view)
  }, [])

  const exchangeLabel = selectedExchange
    ? selectedExchange.charAt(0).toUpperCase() + selectedExchange.slice(1)
    : 'All Exchanges'

  return (
    <div className="flex h-screen" style={{ background: '#f8fafc' }}>
      <Sidebar
        currentView={currentView}
        selectedExchange={selectedExchange}
        onNavigate={handleNavigate}
      />
      <main className="flex-1 overflow-hidden">
        {currentView === 'flow' && (
          <FlowGraph exchange={selectedExchange} exchangeLabel={exchangeLabel} />
        )}
        {currentView === 'transactions' && (
          <Transactions exchange={selectedExchange} exchangeLabel={exchangeLabel} />
        )}
        {currentView === 'tally' && (
          <Tally exchange={selectedExchange} exchangeLabel={exchangeLabel} />
        )}
      </main>
    </div>
  )
}

export default App
