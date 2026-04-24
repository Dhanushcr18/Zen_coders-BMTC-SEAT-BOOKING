import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { getStaff, getBuses } from '../services/api'

const ROLE_COLORS = {
    Driver: 'badge-gold',
    Conductor: 'badge-blue',
    Mechanic: 'badge-green',
}

const STATUS_COLORS = {
    'Active': 'badge-green',
    'On Duty': 'badge-green',
    'Starting': 'badge-gold',
    'Off Duty': 'badge-red',
    'Inactive': 'badge-red',
}

function Avatar({ name, id }) {
    const hue = (id.charCodeAt(0) * 47 + (id.charCodeAt(1) || 0) * 31) % 360
    const initials = name.split(' ').map(n => n[0]).join('')
    return (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: `hsl(${hue},45%,28%)`, border: `1px solid hsl(${hue},45%,40%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: `hsl(${hue},60%,80%)`, flexShrink: 0 }}>
            {initials}
        </div>
    )
}

function Stars({ rating }) {
    if (!rating) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--gold)', letterSpacing: -1 }}>{'★'.repeat(Math.floor(rating))}{'☆'.repeat(5 - Math.floor(rating))}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>{rating}</span>
        </div>
    )
}

export default function Staff() {
    const roles = ['All', 'Driver', 'Conductor', 'Mechanic']
    const [filter, setFilter] = useState('All')
    const [staff, setStaff] = useState([])
    const [buses, setBuses] = useState([])
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState(null)
    const [error, setError] = useState(null)

    const fetchAll = useCallback(async () => {
        try {
            const [staffData, busData] = await Promise.all([getStaff(), getBuses()])
            setStaff(staffData)
            setBuses(busData)
            setLastUpdated(new Date())
            setError(null)
        } catch {
            setError('Cannot reach database. Make sure the DB server is running on port 3001.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchAll()
        const id = setInterval(fetchAll, 5000)
        return () => clearInterval(id)
    }, [fetchAll])

    // Enrich staff with bus route info
    const enriched = staff.map(s => {
        const bus = buses.find(b => b.id === s.bus)
        return { ...s, route: bus?.route || '—' }
    })

    const filtered = filter === 'All' ? enriched : enriched.filter(s => s.role === filter)

    const summaryStats = [
        { label: 'Drivers', value: staff.filter(s => s.role === 'Driver').length, icon: '🚌', color: 'var(--gold)' },
        { label: 'Conductors', value: staff.filter(s => s.role === 'Conductor').length, icon: '🎫', color: 'var(--blue)' },
        { label: 'Mechanics', value: staff.filter(s => s.role === 'Mechanic').length, icon: '🔧', color: 'var(--green)' },
        { label: 'Active', value: staff.filter(s => s.status === 'Active' || s.status === 'On Duty').length, icon: '✅', color: 'var(--green)' },
    ]

    const statusLabel = (s) => {
        // Normalize status for display
        if (s === 'Active') return 'On Duty'
        return s || 'Unknown'
    }

    return (
        <div className="fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1>Staff & Labour</h1>
                    <p>{loading ? 'Loading staff data…' : `${staff.length} staff members in database`}</p>
                    {lastUpdated && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 2 }}>
                            🔄 Live · Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                    )}
                </div>
                <button className="btn-gold" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>+</span> Add Staff
                </button>
            </div>

            {error && (
                <div style={{ marginBottom: 16, padding: '12px 18px', borderRadius: 10, background: 'rgba(255,95,95,0.10)', border: '1px solid rgba(255,95,95,0.3)', color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
                {summaryStats.map((s, i) => (
                    <motion.div key={i} className="card"
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        whileHover={{ y: -2 }}
                    >
                        <div className="stat-icon" style={{ background: `${s.color}14`, border: `1px solid ${s.color}20` }}>
                            {s.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{s.label}</div>
                            <motion.div key={s.value} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1.1 }}
                            >
                                {loading ? '…' : s.value}
                            </motion.div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {roles.map(r => (
                    <button key={r} onClick={() => setFilter(r)} style={{
                        padding: '7px 16px', fontSize: 13, borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 600, transition: 'all 0.18s',
                        background: filter === r ? 'linear-gradient(135deg, var(--gold-dark), var(--gold))' : 'rgba(255,255,255,0.05)',
                        color: filter === r ? '#1a1206' : 'var(--muted)',
                        boxShadow: filter === r ? '0 2px 12px var(--gold-glow)' : 'none',
                    }}>{r}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>{filtered.length} results</span>
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>⏳ Loading staff from database…</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Staff Member</th>
                                <th>Role</th>
                                <th>Assigned Bus</th>
                                <th>Shift</th>
                                <th>Rating</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((s, i) => (
                                <motion.tr key={s.id}
                                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <Avatar name={s.name} id={s.id} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{s.name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{s.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><span className={`badge ${ROLE_COLORS[s.role] || 'badge-gold'}`}>{s.role}</span></td>
                                    <td style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'monospace' }}>{s.bus || '—'}</td>
                                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.shift || '—'}</td>
                                    <td><Stars rating={s.rating} /></td>
                                    <td><span className={`badge ${STATUS_COLORS[s.status] || 'badge-gold'}`}>{statusLabel(s.status)}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <button className="btn-outline" style={{ padding: '5px 12px', fontSize: 12 }}>Edit</button>
                                            <button className="btn-danger" style={{ padding: '5px 12px' }}>Remove</button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && staff.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                        No staff found in database. Add staff to get started.
                    </div>
                )}
            </div>
        </div>
    )
}
