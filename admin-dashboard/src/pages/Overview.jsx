import { useState, useEffect, useCallback } from 'react'
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, AreaChart
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { getBuses, getRoutes, getBookings } from '../services/api'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = [
    '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
    '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
    '6 PM', '7 PM', '8 PM', '9 PM'
]

const tooltipStyle = {
    backgroundColor: '#0f0f18',
    border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 10,
    color: '#f0ead6',
    fontSize: 13,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
}

function fmt(d) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function Overview() {
    const [buses, setBuses] = useState([])
    const [routes, setRoutes] = useState([])
    const [bookings, setBookings] = useState([])
    const [lastUpdated, setLastUpdated] = useState(null)
    const [error, setError] = useState(null)
    const [flash, setFlash] = useState(false)

    const fetchAll = useCallback(async () => {
        try {
            const [busData, routeData, bookingData] = await Promise.all([
                getBuses(), getRoutes(), getBookings()
            ])
            setBuses(busData)
            setRoutes(routeData)
            setBookings(bookingData)
            setLastUpdated(new Date())
            setError(null)
            // brief flash to signal update
            setFlash(true)
            setTimeout(() => setFlash(false), 600)
        } catch {
            setError('Cannot reach database. Make sure DB server is running on port 3001.')
        }
    }, [])

    // initial fetch + 5s polling
    useEffect(() => {
        fetchAll()
        const id = setInterval(fetchAll, 5000)
        return () => clearInterval(id)
    }, [fetchAll])

    // ── Compute KPIs from live data ──────────────────────────────────────────

    const activeBuses = buses.filter(b => b.status !== 'Depot').length
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.fare || 0), 0)
    const totalBookings = bookings.length
    const avgOccupancy = buses.length > 0
        ? Math.round(buses.reduce((sum, b) => sum + (b.seats > 0 ? (b.occupied / b.seats) * 100 : 0), 0) / buses.length)
        : 0

    const activeRoutes = routes.filter(r => r.status === 'Active').length
    const onlineScanners = buses.filter(b => b.scanner === 'Online').length
    const scannerUptime = buses.length > 0 ? ((onlineScanners / buses.length) * 100).toFixed(1) : '0.0'

    const kpis = [
        {
            label: 'Total Revenue Today', icon: '💰', color: 'var(--gold)',
            value: `₹${totalRevenue.toLocaleString('en-IN')}`,
            sub: `from ${totalBookings} booking${totalBookings !== 1 ? 's' : ''}`,
            up: true
        },
        {
            label: 'Active Buses', icon: '🚌', color: 'var(--green)',
            value: activeBuses.toString(),
            sub: `of ${buses.length} total in fleet`,
            up: activeBuses > 0
        },
        {
            label: 'Total Bookings', icon: '🎫', color: 'var(--blue)',
            value: totalBookings.toLocaleString(),
            sub: 'all time in database',
            up: totalBookings > 0
        },
        {
            label: 'Avg Seat Occupancy', icon: '💺', color: avgOccupancy > 80 ? 'var(--red)' : 'var(--gold)',
            value: `${avgOccupancy}%`,
            sub: `across ${buses.length} bus${buses.length !== 1 ? 'es' : ''}`,
            up: avgOccupancy < 85
        },
    ]

    const quickStats = [
        { label: 'Routes Active', value: activeRoutes.toString(), icon: '🗺', color: 'var(--blue)' },
        { label: 'Scanner Uptime', value: `${scannerUptime}%`, icon: '📡', color: 'var(--green)' },
        { label: 'Buses at Full Capacity', value: buses.filter(b => b.status === 'Full').length.toString(), icon: '🔴', color: 'var(--red)' },
    ]

    // ── Charts: derive from real bookings ────────────────────────────────────

    // Revenue per day-of-week from bookings (keyed by DAYS[0..6])
    const revenueByDay = DAYS.map(day => ({ day, revenue: 0, bookings: 0 }))
    bookings.forEach(b => {
        // Try to parse date string. If it starts with "Today" treat as current day.
        let dayIdx = new Date().getDay() // fallback = today
        const raw = (b.date || '').toLowerCase()
        if (raw.startsWith('tomorrow')) dayIdx = (new Date().getDay() + 1) % 7
        else if (!raw.startsWith('today')) {
            // try parse like "Feb 18, 5:00 PM"
            const parsed = new Date(b.date)
            if (!isNaN(parsed)) dayIdx = parsed.getDay()
        }
        revenueByDay[dayIdx].revenue += b.fare || 0
        revenueByDay[dayIdx].bookings += 1
    })
    // Rotate so Mon is first
    const mondayFirst = [...revenueByDay.slice(1), revenueByDay[0]]

    // Peak hours from bookings (only hours in 6-21 range)
    const peakMap = {}
    HOURS.forEach(h => { peakMap[h] = 0 })
    bookings.forEach(b => {
        const raw = (b.date || '')
        const m = raw.match(/(\d+):(\d+)\s*(AM|PM)/i)
        if (m) {
            let h = parseInt(m[1])
            const ampm = m[3].toUpperCase()
            if (ampm === 'PM' && h !== 12) h += 12
            if (ampm === 'AM' && h === 12) h = 0
            // Map to display label
            let label = null
            if (h < 12) label = `${h} AM`
            else if (h === 12) label = '12 PM'
            else label = `${h - 12} PM`
            if (peakMap[label] !== undefined) peakMap[label]++
        }
    })
    const peakData = HOURS.map(hour => ({ hour, bookings: peakMap[hour] || 0 }))

    // If all zero (not enough data yet) show placeholder message alongside chart
    const hasChartData = mondayFirst.some(d => d.revenue > 0)
    const hasPeakData = peakData.some(d => d.bookings > 0)

    return (
        <div className="fade-up">
            {/* Error banner */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{
                            marginBottom: 16, padding: '12px 18px', borderRadius: 10,
                            background: 'rgba(255,95,95,0.10)', border: '1px solid rgba(255,95,95,0.3)',
                            color: 'var(--red)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
                        }}
                    >
                        ⚠️ {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Page header */}
            <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Operations Overview</h1>
                    <p style={{ color: 'var(--muted)', fontSize: 14 }}>Real-time analytics for BMTC fleet management. Auto-refreshes every 5s.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <motion.span
                        animate={{ borderColor: flash ? 'rgba(94,220,138,0.7)' : 'rgba(94,220,138,0.25)' }}
                        transition={{ duration: 0.4 }}
                        className="badge badge-gold"
                        style={{ fontSize: 12, padding: '6px 14px', border: '1px solid' }}
                    >
                        🟢 Live Data
                    </motion.span>
                    {lastUpdated && (
                        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                            Updated {fmt(lastUpdated)}
                        </span>
                    )}
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
                {kpis.map((k, i) => (
                    <motion.div key={i} className="kpi-card"
                        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{k.label}</div>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${k.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, border: `1px solid ${k.color}22`, flexShrink: 0 }}>{k.icon}</div>
                        </div>
                        <motion.div
                            key={k.value}
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                            style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', marginBottom: 6, lineHeight: 1 }}
                        >
                            {k.value}
                        </motion.div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k.sub}</div>
                    </motion.div>
                ))}
            </div>

            {/* ── Charts ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
                {/* Revenue Trend */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Revenue by Day</h3>
                            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Fare totals from bookings in DB</p>
                        </div>
                        <span className="badge badge-gold">Live DB</span>
                    </div>
                    {hasChartData ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={mondayFirst}>
                                <defs>
                                    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.28} />
                                        <stop offset="95%" stopColor="#C9A84C" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="day" tick={{ fill: '#6a6a82', fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#6a6a82', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1).toFixed(0)}`} />
                                <Tooltip contentStyle={tooltipStyle} formatter={v => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
                                <Area type="monotone" dataKey="revenue" stroke="#C9A84C" strokeWidth={2.5} fill="url(#goldGrad)" dot={{ fill: '#C9A84C', r: 3, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#C9A84C', stroke: '#1a1206', strokeWidth: 2 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13, flexDirection: 'column', gap: 8 }}>
                            <span style={{ fontSize: 28 }}>📊</span>
                            <span>Revenue chart populates as bookings are made</span>
                        </div>
                    )}
                </div>

                {/* Peak Booking Hours */}
                <div className="card">
                    <div style={{ marginBottom: 20 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700 }}>Peak Booking Hours</h3>
                        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Today's hourly bookings</p>
                    </div>
                    {hasPeakData ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={peakData} barSize={5}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="hour" tick={{ fill: '#6a6a82', fontSize: 9 }} axisLine={false} tickLine={false} interval={3} />
                                <YAxis tick={{ fill: '#6a6a82', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar dataKey="bookings" fill="#C9A84C" radius={[4, 4, 0, 0]} opacity={0.8} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13, flexDirection: 'column', gap: 8 }}>
                            <span style={{ fontSize: 28 }}>⏰</span>
                            <span>Hourly data populates from bookings</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Quick stats row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {quickStats.map((s, i) => (
                    <motion.div key={i} className="card"
                        style={{ display: 'flex', alignItems: 'center', gap: 16 }}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.07 }}
                        whileHover={{ y: -2 }}
                    >
                        <div className="stat-icon" style={{ background: `${s.color}14`, border: `1px solid ${s.color}22` }}>{s.icon}</div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>{s.label}</div>
                            <motion.div key={s.value} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                style={{ fontSize: 24, fontWeight: 900, color: s.color, lineHeight: 1 }}
                            >
                                {s.value}
                            </motion.div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}
