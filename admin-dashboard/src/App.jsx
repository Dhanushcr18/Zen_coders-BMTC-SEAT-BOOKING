import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import BusFleet from './pages/BusFleet'
import RouteManagement from './pages/RouteManagement'
import Staff from './pages/Staff'
import Login from './pages/Login'
import Scanner from './pages/Scanner'
import './index.css'

export default function App() {
  const [page, setPage] = useState('overview')

  // Check for existing session
  const stored = localStorage.getItem('bmtc_admin')
  const [user, setUser] = useState(stored ? JSON.parse(stored) : null)

  const handleLogin = (u) => setUser(u)
  const handleLogout = () => {
    localStorage.removeItem('bmtc_admin')
    setUser(null)
  }

  if (!user) return <Login onLogin={handleLogin} />

  const pages = { overview: <Overview />, fleet: <BusFleet />, routes: <RouteManagement />, staff: <Staff />, scanner: <Scanner /> }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar active={page} onNavigate={setPage} user={user} onLogout={handleLogout} />
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0 }}>
        {pages[page]}
      </main>
    </div>
  )
}
