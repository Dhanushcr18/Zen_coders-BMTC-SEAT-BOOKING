import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const BASE = 'http://localhost:3001'

export default function Login({ onLogin }) {
    const [form, setForm] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPass, setShowPass] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!form.email.trim() || !form.password.trim()) {
            setError('Please enter your email and password.')
            return
        }

        setLoading(true)
        try {
            const res = await fetch(`${BASE}/users?email=${encodeURIComponent(form.email.trim())}`)
            const users = await res.json()
            const user = users[0]

            if (!user) {
                setError('No account found with that email address.')
                return
            }
            if (user.password !== form.password) {
                setError('Incorrect password. Please try again.')
                return
            }
            if (user.role !== 'admin') {
                setError('Access denied. This panel is for admins only.')
                return
            }

            // Store session and pass user up
            localStorage.setItem('bmtc_admin', JSON.stringify({ id: user.id, name: user.name, email: user.email }))
            onLogin(user)
        } catch {
            setError('Cannot connect to database. Make sure DB server is running on port 3001.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'radial-gradient(ellipse at 20% 30%, rgba(201,168,76,0.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 70%, rgba(201,168,76,0.04) 0%, transparent 55%), var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
            {/* Background grid pattern */}
            <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                    width: '100%', maxWidth: 420,
                    background: 'var(--surface)',
                    border: '1px solid rgba(201,168,76,0.25)',
                    borderRadius: 18,
                    padding: '40px 36px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.1)'
                }}
            >
                {/* Gold top accent */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent 0%, var(--gold) 50%, transparent 100%)' }} />

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 36 }}>
                    <motion.div
                        initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 12 }}
                    >
                        <div style={{
                            width: 48, height: 48, borderRadius: 14,
                            background: 'linear-gradient(135deg, #8b6914, var(--gold))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 24, boxShadow: '0 4px 24px rgba(201,168,76,0.35)'
                        }}>🚌</div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-0.5px' }}>BMTC</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 3, textTransform: 'uppercase' }}>Admin Panel</div>
                        </div>
                    </motion.div>
                    <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sign in with your admin credentials</p>
                </div>

                {/* Error */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            style={{
                                marginBottom: 18, padding: '10px 14px', borderRadius: 9,
                                background: 'rgba(255,95,95,0.10)', border: '1px solid rgba(255,95,95,0.28)',
                                color: 'var(--red)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center'
                            }}
                        >
                            ⚠️ {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Email Address</label>
                        <input
                            className="input"
                            type="email"
                            placeholder="admin@bmtc.in"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            disabled={loading}
                            autoFocus
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Password</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input"
                                type={showPass ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                disabled={loading}
                                style={{ width: '100%', paddingRight: 44 }}
                            />
                            <button type="button" onClick={() => setShowPass(s => !s)}
                                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 15 }}>
                                {showPass ? '🙈' : '👁'}
                            </button>
                        </div>
                    </div>

                    <motion.button
                        type="submit"
                        className="btn-gold"
                        style={{ fontSize: 15, marginTop: 4, letterSpacing: 0.5, opacity: loading ? 0.7 : 1 }}
                        disabled={loading}
                        whileTap={{ scale: 0.97 }}
                    >
                        {loading ? '⏳ Signing in…' : '→ Sign In to Dashboard'}
                    </motion.button>
                </form>

                {/* Demo hint */}
                <div style={{ marginTop: 20, padding: '10px 14px', borderRadius: 9, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Demo Credentials</div>
                    <div style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'monospace' }}>admin@bmtc.in · admin123</div>
                </div>
            </motion.div>
        </div>
    )
}
