import { useState, useEffect, useCallback } from 'react'
import { getRoutes, createRoute, deleteRoute, updateRoute } from '../services/api'

const DEFAULT_PATH_POOL = [
    [[12.978, 77.572], [12.984, 77.598], [12.979, 77.636], [12.970, 77.750]],
    [[12.978, 77.572], [12.917, 77.623], [12.900, 77.630], [12.845, 77.665]],
    [[13.024, 77.551], [12.997, 77.555], [12.948, 77.574], [12.934, 77.624]],
    [[12.987, 77.731], [12.960, 77.700], [12.921, 77.622], [12.917, 77.575]],
]

export default function RouteManagement() {
    const [routes, setRoutes] = useState([])
    const [loading, setLoading] = useState(true)
    const [form, setForm] = useState({ name: '', fare: '', stops: ['', ''] })
    const [pushStatus, setPushStatus] = useState('idle')
    const [showForm, setShowForm] = useState(false)
    const [toast, setToast] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    const fetchRoutes = useCallback(async () => {
        try {
            const data = await getRoutes()
            setRoutes(data)
            setLastUpdated(new Date())
        } catch {
            showToast('Could not connect to database. Is the DB server running?', 'error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchRoutes()
        const id = setInterval(fetchRoutes, 5000)
        return () => clearInterval(id)
    }, [fetchRoutes])

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const addStop = () => setForm(f => ({ ...f, stops: [...f.stops, ''] }))
    const removeStop = (i) => setForm(f => ({ ...f, stops: f.stops.filter((_, idx) => idx !== i) }))
    const setStop = (i, v) => setForm(f => { const s = [...f.stops]; s[i] = v; return { ...f, stops: s } })

    const handleAdd = async (e) => {
        e.preventDefault()
        const filled = form.stops.filter(Boolean)
        if (!form.name || filled.length < 2) {
            showToast('Please fill in the route name and at least 2 stops.', 'error')
            return
        }
        const newRoute = {
            id: `R${String(routes.length + 1).padStart(3, '0')}`,
            name: form.name,
            stops: filled,
            fare: Number(form.fare) || 30,
            buses: 0,
            status: 'Active',
            duration: `${45 + routes.length * 5} min`,
            distance: `${18 + routes.length * 4} km`,
            path: DEFAULT_PATH_POOL[routes.length % DEFAULT_PATH_POOL.length]
        }
        try {
            const saved = await createRoute(newRoute)
            setRoutes(r => [...r, saved])
            setForm({ name: '', fare: '', stops: ['', ''] })
            setShowForm(false)
            showToast(`Route "${saved.name}" saved to database!`)
        } catch {
            showToast('Failed to save route. Check DB server.', 'error')
        }
    }

    const handleDelete = async (id) => {
        try {
            await deleteRoute(id)
            setRoutes(r => r.filter(rt => rt.id !== id))
            showToast('Route deleted.')
        } catch {
            showToast('Failed to delete route.', 'error')
        }
    }

    const toggleStatus = async (id, currentStatus) => {
        const newStatus = currentStatus === 'Active' ? 'Draft' : 'Active'
        try {
            await updateRoute(id, { status: newStatus })
            setRoutes(r => r.map(rt => rt.id === id ? { ...rt, status: newStatus } : rt))
        } catch {
            showToast('Failed to update status.', 'error')
        }
    }

    const handlePush = async () => {
        setPushStatus('loading')
        await new Promise(r => setTimeout(r, 1200))
        setPushStatus('success')
        showToast('All routes synced — user app will see changes instantly!')
        setTimeout(() => setPushStatus('idle'), 3000)
    }

    return (
        <div className="fade-up" style={{ position: 'relative' }}>
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 24, right: 24, zIndex: 9999,
                    background: toast.type === 'error' ? 'rgba(255,107,107,0.15)' : 'rgba(107,203,119,0.15)',
                    border: `1px solid ${toast.type === 'error' ? 'rgba(255,107,107,0.4)' : 'rgba(107,203,119,0.4)'}`,
                    color: toast.type === 'error' ? '#ff6b6b' : '#6bcb77',
                    padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                    backdropFilter: 'blur(10px)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
                }}>
                    {toast.type === 'error' ? '⚠️' : '✅'} {toast.msg}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 800 }}>Route Management</h1>
                    <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
                        {loading ? 'Loading…' : `${routes.length} routes · Synced with database.`}
                    </p>
                    {lastUpdated && (
                        <p style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 2 }}>
                            🔄 Live · Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        className="btn-gold"
                        style={{ background: pushStatus === 'success' ? 'linear-gradient(135deg,#3a7d44,#6bcb77)' : undefined }}
                        onClick={handlePush} disabled={pushStatus === 'loading'}
                    >
                        {pushStatus === 'loading' ? '⏳ Syncing…' : pushStatus === 'success' ? '✅ Synced!' : '🔄 Push Updates'}
                    </button>
                    <button className="btn-gold" onClick={() => setShowForm(f => !f)}>
                        {showForm ? '✕ Cancel' : '+ New Route'}
                    </button>
                </div>
            </div>

            {/* Add Route Form */}
            {showForm && (
                <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(201,168,76,0.3)' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--gold)' }}>✏️ Build New Route</h3>
                    <form onSubmit={handleAdd}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 14 }}>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Route Name *</label>
                                <input className="input" placeholder="e.g. Hebbal → Koramangala" value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Base Fare (₹)</label>
                                <input className="input" type="number" placeholder="45" value={form.fare}
                                    onChange={e => setForm(f => ({ ...f, fare: e.target.value }))} />
                            </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <label style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Stops * (min 2)</label>
                                <button type="button" className="btn-outline" style={{ padding: '5px 12px', fontSize: 12 }} onClick={addStop}>+ Add Stop</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {form.stops.map((stop, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                                        <input className="input"
                                            placeholder={i === 0 ? 'Origin stop' : i === form.stops.length - 1 ? 'Destination stop' : `Stop ${i + 1}`}
                                            value={stop} onChange={e => setStop(i, e.target.value)} />
                                        {form.stops.length > 2 && (
                                            <button type="button" onClick={() => removeStop(i)}
                                                style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type="submit" className="btn-gold">💾 Save Route</button>
                            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Routes table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>⏳ Loading routes from database…</div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Route ID</th><th>Name</th><th>Stops</th><th>Fare</th><th>Buses</th><th>Status</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {routes.map(r => (
                                <tr key={r.id}>
                                    <td><span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)' }}>{r.id}</span></td>
                                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 300 }}>
                                            {r.stops.map((s, i) => (
                                                <span key={i} style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 4, color: 'var(--muted)' }}>{s}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: 700, color: 'var(--gold)' }}>₹{r.fare}</td>
                                    <td style={{ color: 'var(--text)' }}>{r.buses}</td>
                                    <td>
                                        <span className={`badge ${r.status === 'Active' ? 'badge-green' : 'badge-gold'}`}>{r.status}</span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn-outline" style={{ padding: '5px 10px', fontSize: 12 }}
                                                onClick={() => toggleStatus(r.id, r.status)}>
                                                {r.status === 'Active' ? 'Deactivate' : 'Activate'}
                                            </button>
                                            <button className="btn-outline"
                                                style={{ padding: '5px 10px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(255,107,107,0.3)' }}
                                                onClick={() => handleDelete(r.id)}>Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && routes.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                        No routes yet. Click "+ New Route" to add one.
                    </div>
                )}
            </div>
        </div>
    )
}
