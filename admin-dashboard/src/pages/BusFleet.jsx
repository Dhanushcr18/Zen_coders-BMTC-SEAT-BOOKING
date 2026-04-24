import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getRoutes, getBuses, createBus, deleteBus } from '../services/api'

const STATUSES = ['On Route', 'Starting', 'Depot', 'Full']

export default function BusFleet() {
    const [buses, setBuses] = useState([])
    const [routeNames, setRouteNames] = useState([])
    const [showModal, setShowModal] = useState(false)
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState(null)
    const [search, setSearch] = useState('')
    const [lastUpdated, setLastUpdated] = useState(null)
    const [form, setForm] = useState({
        id: '', route: '', driver: '', driverId: '',
        seats: 40, occupied: 0, status: 'Depot', scanner: 'Offline', eta: '--'
    })

    useEffect(() => {
        fetchAll()
        const id = setInterval(fetchAll, 5000)
        return () => clearInterval(id)
    }, [])

    async function fetchAll() {
        try {
            const [busData, routeData] = await Promise.all([getBuses(), getRoutes()])
            setBuses(busData)
            setRouteNames(routeData.map(r => r.name))
            setForm(f => ({ ...f, route: routeData[0]?.name || '' }))
            setLastUpdated(new Date())
        } catch {
            showToast('Cannot connect to database. Is the DB server running?', 'error')
        } finally {
            setLoading(false)
        }
    }

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const handleAdd = async (e) => {
        e.preventDefault()
        if (!form.id || !form.driver) {
            showToast('Bus ID and Driver Name are required.', 'error')
            return
        }
        if (buses.find(b => b.id === form.id)) {
            showToast(`Bus ID "${form.id}" already exists.`, 'error')
            return
        }
        try {
            const newBus = { ...form, seats: Number(form.seats), occupied: Number(form.occupied) }
            const saved = await createBus(newBus)
            setBuses(b => [...b, saved])
            setShowModal(false)
            setForm(f => ({ id: '', route: f.route, driver: '', driverId: '', seats: 40, occupied: 0, status: 'Depot', scanner: 'Offline', eta: '--' }))
            showToast(`Bus ${saved.id} added to fleet!`)
        } catch {
            showToast('Failed to add bus. Check DB server.', 'error')
        }
    }

    const handleDelete = async (id) => {
        try {
            await deleteBus(id)
            setBuses(b => b.filter(bus => bus.id !== id))
            showToast('Bus removed from fleet.')
        } catch {
            showToast('Failed to remove bus.', 'error')
        }
    }

    const openModal = async () => {
        const routeData = await getRoutes().catch(() => [])
        const names = routeData.map(r => r.name)
        setRouteNames(names)
        setForm(f => ({ ...f, route: names[0] || '' }))
        setShowModal(true)
    }

    const statusColor = (s) => {
        if (s === 'On Route') return 'badge-green'
        if (s === 'Full') return 'badge-red'
        if (s === 'Starting') return 'badge-gold'
        return 'badge-blue'
    }

    const filteredBuses = buses.filter(b =>
        b.id.toLowerCase().includes(search.toLowerCase()) ||
        b.route.toLowerCase().includes(search.toLowerCase()) ||
        b.driver.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="fade-up">
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, x: 40, y: 0 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
                        style={{
                            position: 'fixed', top: 24, right: 24, zIndex: 9999,
                            background: toast.type === 'error' ? 'rgba(255,95,95,0.14)' : 'rgba(94,220,138,0.14)',
                            border: `1px solid ${toast.type === 'error' ? 'rgba(255,95,95,0.38)' : 'rgba(94,220,138,0.35)'}`,
                            color: toast.type === 'error' ? 'var(--red)' : 'var(--green)',
                            padding: '13px 20px', borderRadius: 12, fontWeight: 600, fontSize: 14,
                            backdropFilter: 'blur(12px)', boxShadow: '0 8px 36px rgba(0,0,0,0.4)',
                            display: 'flex', alignItems: 'center', gap: 8, maxWidth: 320
                        }}
                    >
                        {toast.type === 'error' ? '⚠️' : '✅'} {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Bus Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998, backdropFilter: 'blur(6px)', padding: 20 }}
                    onClick={() => setShowModal(false)}>
                    <div className="card" style={{ width: '100%', maxWidth: 520, padding: '28px 28px', position: 'relative', border: '1px solid rgba(201,168,76,0.3)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)', borderRadius: '14px 14px 0 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>➕ Add New Bus</h2>
                                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Register a bus to the BMTC fleet.</p>
                            </div>
                            <button onClick={() => setShowModal(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 22 }}>✕</button>
                        </div>

                        <form onSubmit={handleAdd}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bus ID *</label>
                                    <input className="input" placeholder="KA-07-M-2345" value={form.id}
                                        onChange={e => setForm(f => ({ ...f, id: e.target.value.toUpperCase() }))} required />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Route</label>
                                    <select className="input" value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
                                        {routeNames.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Driver Name *</label>
                                    <input className="input" placeholder="Ravi Shankar" value={form.driver}
                                        onChange={e => setForm(f => ({ ...f, driver: e.target.value }))} required />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Driver ID</label>
                                    <input className="input" placeholder="D007" value={form.driverId}
                                        onChange={e => setForm(f => ({ ...f, driverId: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Seats</label>
                                    <input className="input" type="number" min={10} max={60} value={form.seats}
                                        onChange={e => setForm(f => ({ ...f, seats: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</label>
                                    <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                <button type="submit" className="btn-gold" style={{ flex: 1, fontSize: 15 }}>💾 Add Bus to Fleet</button>
                                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1>Bus Fleet</h1>
                    <p>{loading ? 'Loading fleet data…' : `${buses.length} buses in fleet`}</p>
                    {lastUpdated && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 2 }}>
                            🔄 Live · Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn-outline">⬇ Export CSV</button>
                    <button className="btn-gold" onClick={openModal}>+ Add Bus</button>
                </div>
            </div>

            {/* Search bar */}
            <div style={{ position: 'relative', marginBottom: 18 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 15 }}>🔍</span>
                <input
                    className="input"
                    style={{ paddingLeft: 36 }}
                    placeholder="Search by bus ID, route or driver…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                {search && (
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--muted)' }}>
                        {filteredBuses.length} result{filteredBuses.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
                {[
                    { label: 'Total Buses', value: buses.length, icon: '🚌', color: 'var(--gold)' },
                    { label: 'On Route', value: buses.filter(b => b.status === 'On Route').length, icon: '✅', color: 'var(--green)' },
                    { label: 'Full Capacity', value: buses.filter(b => b.status === 'Full').length, icon: '🔴', color: 'var(--red)' },
                    { label: 'In Depot', value: buses.filter(b => b.status === 'Depot').length, icon: '🏠', color: 'var(--blue)' },
                ].map((s, i) => (
                    <motion.div key={i} className="card"
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        whileHover={{ y: -2 }}
                    >
                        <div className="stat-icon" style={{ background: `${s.color}14`, border: `1px solid ${s.color}22` }}>{s.icon}</div>
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{s.label}</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Fleet table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>⏳ Loading buses from database…</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Bus ID</th><th>Route</th><th>Driver</th><th>Seat Capacity</th><th>AI Scanner</th><th>Status</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBuses.map((bus, i) => {
                                const pct = Math.round((bus.occupied / bus.seats) * 100)
                                const barColor = pct > 90 ? 'var(--red)' : pct > 60 ? 'var(--gold)' : 'var(--green)'
                                return (
                                    <motion.tr key={bus.id}
                                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                                    >
                                        <td>
                                            <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--text)', letterSpacing: 0.5 }}>{bus.id}</div>
                                        </td>
                                        <td style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 180 }}>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bus.route}</div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#1a1206', flexShrink: 0 }}>
                                                    {bus.driver[0]}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{bus.driver}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{bus.driverId}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ minWidth: 150 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 7, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                                                    <motion.div
                                                        initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.2 + i * 0.03, duration: 0.6 }}
                                                        style={{ height: '100%', borderRadius: 4, background: barColor }}
                                                    />
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: barColor, flexShrink: 0 }}>{bus.occupied}/{bus.seats}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${bus.scanner === 'Online' ? 'badge-green' : 'badge-red'}`}>
                                                {bus.scanner === 'Online' ? '● Online' : '○ Offline'}
                                            </span>
                                        </td>
                                        <td><span className={`badge ${statusColor(bus.status)}`}>{bus.status}</span></td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn-outline" style={{ padding: '5px 12px', fontSize: 12 }}>View</button>
                                                <button className="btn-danger" onClick={() => handleDelete(bus.id)}>Remove</button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
                {!loading && buses.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                        No buses yet. Click "+ Add Bus" to register one.
                    </div>
                )}
            </div>
        </div>
    )
}
