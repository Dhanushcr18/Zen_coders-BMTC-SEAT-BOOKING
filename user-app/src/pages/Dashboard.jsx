import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

import { getRoutes, getBuses, getBookings } from '../services/api'
import SeatSelector from '../components/SeatSelector'
import Payment from '../components/Payment'
import Home from './Home'

const LiveMap = lazy(() => import('../components/LiveMap'))

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.22 } }
}

const tabs = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'routes', label: 'Routes', icon: '🗺' },
    { id: 'buses', label: 'Buses', icon: '🚌' },
    { id: 'bookings', label: 'Bookings', icon: '📋' },
]

export default function Dashboard() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('home')
    const [selectedRoute, setSelectedRoute] = useState(null)
    const [showSeats, setShowSeats] = useState(null)
    const [showPayment, setShowPayment] = useState(null)
    const [routes, setRoutes] = useState([])
    const [buses, setBuses] = useState([])
    const [bookings, setBookings] = useState([])
    const [dbError, setDbError] = useState(false)
    const [lastSync, setLastSync] = useState(null)
    const busIntervalRef = useRef(null)

    // Read logged-in user from localStorage
    const storedUser = localStorage.getItem('bmtc_user')
    const [user] = useState(storedUser ? JSON.parse(storedUser) : { name: 'Guest', email: '' })

    const handleLogout = () => {
        localStorage.removeItem('bmtc_user')
        navigate('/auth')
    }

    // Greeting based on time
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

    // Fetch buses every 10s so seat vacancy from scanner stays live
    const fetchBuses = useCallback(async () => {
        try {
            const b = await getBuses()
            setBuses(b)
            setLastSync(new Date())
            setDbError(false)
        } catch {
            setDbError(true)
        }
    }, [])

    useEffect(() => {
        async function fetchAll() {
            try {
                const [r, bk] = await Promise.all([
                    getRoutes(),
                    getBookings(user.email)
                ])
                setRoutes(r)
                setBookings(bk)
            } catch {
                setDbError(true)
            }
        }
        fetchAll()
    }, [activeTab, user.email])

    // Bus polling — 10 second interval for live seat vacancy
    useEffect(() => {
        fetchBuses()
        busIntervalRef.current = setInterval(fetchBuses, 10000)
        return () => clearInterval(busIntervalRef.current)
    }, [fetchBuses])

    return (
        <div style={{ minHeight: '100vh', background: 'var(--charcoal-dark)', display: 'flex', flexDirection: 'column', paddingBottom: 'var(--nav-h)' }}>
            {/* ── Topbar ── */}
            <header style={{
                background: 'rgba(8,8,16,0.92)', backdropFilter: 'blur(24px)',
                borderBottom: '1px solid var(--charcoal-border)',
                padding: '0 20px', height: 60, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: 10,
                        background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, boxShadow: '0 2px 12px var(--gold-glow)'
                    }}>🚌</div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--gold)', lineHeight: 1.1 }}>BMTC</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Smart Transit</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'rgba(94,220,138,0.1)', border: '1px solid rgba(94,220,138,0.25)',
                        borderRadius: 20, padding: '4px 10px'
                    }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-gold 1.5s infinite' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', letterSpacing: 0.5 }}>LIVE</span>
                        {lastSync && (
                            <span style={{ fontSize: 10, color: 'var(--green)', opacity: 0.7, fontFamily: 'monospace' }}>
                                · {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                        )}
                    </div>
                    {/* Avatar with logout */}
                    <div
                        onClick={handleLogout}
                        title="Sign out"
                        style={{
                            width: 34, height: 34, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 14, color: '#1a1206',
                            boxShadow: '0 2px 10px var(--gold-glow)',
                            cursor: 'pointer'
                        }}
                    >
                        {user.name[0]}
                    </div>
                </div>
            </header>

            {/* ── Content ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 16px 0', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
                {/* Hero greeting */}
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: 22 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                        {greeting}, <span style={{ color: 'var(--gold)' }}>{user.name.split(' ')[0]}</span> 👋
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>
                        Track live buses across Bengaluru in real-time.
                    </p>
                </motion.div>

                {/* DB error banner */}
                {dbError && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{
                            background: 'rgba(255,95,95,0.1)', border: '1px solid rgba(255,95,95,0.28)',
                            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
                            fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8
                        }}>
                        ⚠️ Cannot reach database — run <strong style={{ fontFamily: 'monospace' }}>npm start</strong> inside the <strong style={{ fontFamily: 'monospace' }}>db/</strong> folder to load live data.
                    </motion.div>
                )}

                {/* Content */}
                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} variants={pageVariants} initial="initial" animate="animate" exit="exit">

                        {activeTab === 'home' && <Home onNavigate={setActiveTab} />}

                        {activeTab === 'routes' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div className="section-title">Available Routes</div>
                                    {routes.map(route => {
                                        // Normalise: strip arrows, hyphens, spaces for flexible matching
                                        const norm = s => s.toLowerCase().replace(/[→\-–]/g, ' ').replace(/\s+/g, ' ').trim()
                                        const routeNorm = norm(route.name)
                                        // Pick the bus on this route with most available seats
                                        const matchingBuses = buses.filter(b => norm(b.route) === routeNorm)
                                        const busForRoute = matchingBuses.sort((a, b) => (a.occupied - b.occupied))[0]
                                        const available = busForRoute ? busForRoute.seats - busForRoute.occupied : null
                                        const isFull = busForRoute ? busForRoute.occupied >= busForRoute.seats : false

                                        return (
                                        <motion.div key={route.id}
                                            className="glass"
                                            style={{
                                                padding: '16px 18px', cursor: 'pointer',
                                                border: selectedRoute === route.id
                                                    ? '1px solid var(--gold)'
                                                    : '1px solid rgba(201,168,76,0.1)'
                                            }}
                                            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                                            onClick={() => setSelectedRoute(selectedRoute === route.id ? null : route.id)}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: 15, color: selectedRoute === route.id ? 'var(--gold)' : 'var(--text-primary)', marginBottom: 3 }}>{route.name}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{route.stops.join(' → ')}</div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                                    <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--gold)' }}>₹{route.fare}</span>
                                                    {available !== null && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                                                            background: isFull ? 'rgba(255,95,95,0.15)' : available <= 3 ? 'rgba(201,168,76,0.15)' : 'rgba(94,220,138,0.15)',
                                                            color: isFull ? 'var(--red)' : available <= 3 ? 'var(--gold)' : 'var(--green)',
                                                            border: `1px solid ${isFull ? 'rgba(255,95,95,0.3)' : available <= 3 ? 'rgba(201,168,76,0.3)' : 'rgba(94,220,138,0.3)'}`,
                                                        }}>
                                                            {isFull ? '🔴 Full' : `🟢 ${available} seats free`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⏱ {route.duration}</span>
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📍 {route.distance}</span>
                                                {selectedRoute === route.id && !isFull && (
                                                    <motion.button
                                                        className="btn-gold"
                                                        style={{ marginLeft: 'auto', padding: '7px 14px', fontSize: 12 }}
                                                        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                                                        onClick={e => { e.stopPropagation(); setShowSeats({ ...route, busForRoute }) }}
                                                    >Book Seat →</motion.button>
                                                )}
                                                {selectedRoute === route.id && isFull && (
                                                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>🔴 Bus is full</span>
                                                )}
                                            </div>
                                        </motion.div>
                                        )
                                    })}
                                </div>

                                <div style={{ height: 500, borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 80 }}>
                                    <Suspense fallback={
                                        <div style={{ height: '100%', background: 'var(--charcoal-card)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                            Loading map…
                                        </div>
                                    }>
                                        <LiveMap selectedRoute={selectedRoute} routes={routes} />
                                    </Suspense>
                                </div>
                            </div>
                        )}

                        {activeTab === 'buses' && (
                            <div>
                                <div className="section-title">Live Bus Fleet</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {buses.map((bus, i) => {
                                        const pct = Math.round((bus.occupied / bus.seats) * 100)
                                        const statusColor = bus.status === 'Full' ? 'var(--red)' : bus.status === 'On Route' ? 'var(--green)' : 'var(--gold)'
                                        return (
                                            <motion.div key={bus.id} className="glass" style={{ padding: '16px 18px' }}
                                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                                whileHover={{ scale: 1.005 }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                                    {/* Bus icon + ID */}
                                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 160 }}>
                                                        <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🚌</div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{bus.id}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{bus.route}</div>
                                                        </div>
                                                    </div>

                                                    {/* Capacity bar */}
                                                    <div style={{ flex: 2, maxWidth: 200, minWidth: 120 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Capacity</span>
                                                            <span style={{ fontSize: 11, fontWeight: 700, color: pct > 90 ? 'var(--red)' : pct > 60 ? 'var(--gold)' : 'var(--green)' }}>{bus.occupied}/{bus.seats}</span>
                                                        </div>
                                                        <div style={{ height: 7, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                                                            <motion.div
                                                                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.05 + 0.3, duration: 0.7 }}
                                                                style={{ height: '100%', borderRadius: 4, background: pct > 90 ? 'var(--red)' : pct > 60 ? 'var(--gold)' : 'var(--green)' }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Meta */}
                                                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Driver</div>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{bus.driver}</div>
                                                        </div>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>ETA</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace' }}>{bus.eta}</div>
                                                        </div>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20,
                                                            background: `${statusColor}18`,
                                                            color: statusColor,
                                                            border: `1px solid ${statusColor}40`
                                                        }}>{bus.status}</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {activeTab === 'bookings' && (
                            <div>
                                <div className="section-title">My Bookings</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {bookings.map((bk, i) => {
                                        const statusColor = bk.status === 'Confirmed' ? 'var(--green)' : bk.status === 'Upcoming' ? 'var(--gold)' : 'var(--text-secondary)'
                                        const statusBg = bk.status === 'Confirmed' ? 'rgba(94,220,138,0.12)' : bk.status === 'Upcoming' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.06)'
                                        const statusBdr = bk.status === 'Confirmed' ? 'rgba(94,220,138,0.28)' : bk.status === 'Upcoming' ? 'rgba(201,168,76,0.28)' : 'rgba(255,255,255,0.1)'
                                        return (
                                            <motion.div key={bk.id} className="glass" style={{ padding: '18px 20px' }}
                                                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                                                whileHover={{ scale: 1.005 }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                                                    <div>
                                                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{bk.route}</div>
                                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 3 }}>
                                                            🚌 {bk.bus} · Seat <strong style={{ color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace' }}>{bk.seat}</strong>
                                                        </div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📅 {bk.date}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)', marginBottom: 6 }}>₹{bk.fare}</div>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                                                            background: statusBg, color: statusColor, border: `1px solid ${statusBdr}`
                                                        }}>{bk.status}</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* ── Bottom Navigation Bar ── */}
            <nav className="bottom-nav">
                {tabs.map(t => (
                    <button key={t.id} className={`bottom-nav-item ${activeTab === t.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.id)}>
                        <div className="nav-icon-wrap">{t.icon}</div>
                        <span className="nav-label">{t.label}</span>
                    </button>
                ))}
            </nav>

            {/* ── Seat Selection Modal ── */}
            <AnimatePresence>
                {showSeats && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 9998, backdropFilter: 'blur(8px)', padding: '0 0 var(--nav-h)' }}
                        onClick={() => setShowSeats(null)}
                    >
                        <motion.div
                            className="glass-flat" style={{ width: '100%', maxWidth: 520, padding: '24px 22px', maxHeight: '85vh', overflowY: 'auto', borderRadius: '20px 20px 0 0', borderBottom: 'none' }}
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Handle */}
                            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--charcoal-border)', margin: '0 auto 18px' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                                <div>
                                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Select Your Seat</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{showSeats.name}</div>
                                </div>
                                <button onClick={() => setShowSeats(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--charcoal-border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                            </div>
                            <SeatSelector routeId={showSeats.id} busForRoute={showSeats.busForRoute} onBook={(seat) => { setShowSeats(null); setShowPayment({ route: showSeats, seat }) }} />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Payment Modal ── */}
            <AnimatePresence>
                {showPayment && (
                    <Payment
                        amount={showPayment.route.fare}
                        routeName={showPayment.route.name}
                        onClose={() => setShowPayment(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
