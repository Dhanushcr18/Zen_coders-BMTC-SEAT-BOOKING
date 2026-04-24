import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import './index.css'

function RequireAuth({ children }) {
  const user = localStorage.getItem('bmtc_user')
  return user ? children : <Navigate to="/auth" replace />
}

function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard/*" element={<RequireAuth><Dashboard /></RequireAuth>} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  )
}

export default App
