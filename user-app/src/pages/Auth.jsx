import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

const BASE = 'http://localhost:3001'

const pageVariants = {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
}

export default function Auth() {
    const [mode, setMode] = useState('login')
    const [form, setForm] = useState({ name: '', email: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!form.email.trim() || !form.password.trim()) {
            setError('Please enter your email and password.')
            return
        }

        setLoading(true)
        try {
            if (mode === 'login') {
                // Fetch user matching email
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

                // Store session
                localStorage.setItem('bmtc_user', JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }))
                navigate('/dashboard')

            } else {
                // Sign up — check email not already taken
                if (!form.name.trim()) {
                    setError('Please enter your full name.')
                    return
                }
                if (form.password.length < 6) {
                    setError('Password must be at least 6 characters.')
                    return
                }

                const checkRes = await fetch(`${BASE}/users?email=${encodeURIComponent(form.email.trim())}`)
                const existing = await checkRes.json()
                if (existing.length > 0) {
                    setError('An account with this email already exists. Please sign in.')
                    return
                }

                // Create new user
                const newUser = {
                    name: form.name.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    role: 'user'
                }
                const createRes = await fetch(`${BASE}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newUser)
                })
                const created = await createRes.json()
                localStorage.setItem('bmtc_user', JSON.stringify({ id: created.id, name: created.name, email: created.email, role: created.role }))
                navigate('/dashboard')
            }
        } catch {
            setError('Cannot connect to database. Make sure the DB server is running.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <motion.div
            variants={pageVariants} initial="initial" animate="animate" exit="exit"
            style={{
                minHeight: '100vh',
                background: 'radial-gradient(ellipse at 30% 20%, rgba(201,168,76,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(201,168,76,0.05) 0%, transparent 60%), var(--charcoal-dark)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}
        >
            {/* Floating orbs */}
            <div style={{ position: 'fixed', top: '10%', left: '5%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'fixed', bottom: '10%', right: '5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <motion.div
                className="glass"
                style={{ width: '100%', maxWidth: 440, padding: '40px 36px', position: 'relative', overflow: 'hidden' }}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
            >
                {/* Gold shimmer top bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <motion.div
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 8 }}
                        initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
                    >
                        <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, boxShadow: '0 4px 20px var(--gold-glow)'
                        }}>🚌</div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', letterSpacing: '-0.5px' }}>BMTC</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 2, textTransform: 'uppercase' }}>Smart Transit</div>
                        </div>
                    </motion.div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                        {mode === 'login' ? 'Welcome back. Enter your credentials.' : 'Create your transit account.'}
                    </p>
                </div>

                {/* Tab switcher */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, marginBottom: 28 }}>
                    {['login', 'signup'].map(m => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); setError('') }}
                            style={{
                                flex: 1, padding: '9px 0', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', borderRadius: 8, transition: 'all 0.3s',
                                background: mode === m ? 'linear-gradient(135deg, var(--gold-dark), var(--gold))' : 'transparent',
                                color: mode === m ? '#1a1206' : 'var(--text-secondary)'
                            }}
                        >
                            {m === 'login' ? 'Sign In' : 'Sign Up'}
                        </button>
                    ))}
                </div>

                {/* Error banner */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            style={{
                                marginBottom: 16, padding: '10px 14px', borderRadius: 8,
                                background: 'rgba(255,95,95,0.12)', border: '1px solid rgba(255,95,95,0.3)',
                                color: '#ff7070', fontSize: 13, fontWeight: 500,
                                display: 'flex', alignItems: 'center', gap: 8
                            }}
                        >
                            ⚠️ {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    <motion.form
                        key={mode}
                        initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: mode === 'login' ? 20 : -20 }}
                        transition={{ duration: 0.3 }}
                        onSubmit={handleSubmit}
                        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                        {mode === 'signup' && (
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block', letterSpacing: 0.5 }}>FULL NAME</label>
                                <input className="input-dark" placeholder="Rajesh Kumar" type="text"
                                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={loading} />
                            </div>
                        )}
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block', letterSpacing: 0.5 }}>EMAIL ADDRESS</label>
                            <input className="input-dark" placeholder="you@example.com" type="email"
                                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={loading} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: 'block', letterSpacing: 0.5 }}>PASSWORD</label>
                            <input className="input-dark" placeholder="••••••••" type="password"
                                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} disabled={loading} />
                        </div>

                        {mode === 'login' && (
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: 12, color: 'var(--gold)', cursor: 'pointer' }}>Forgot password?</span>
                            </div>
                        )}

                        <motion.button
                            type="submit"
                            className="btn-gold"
                            style={{ marginTop: 8, fontSize: 15, letterSpacing: 0.5, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                            whileTap={{ scale: 0.97 }}
                            disabled={loading}
                        >
                            {loading ? '⏳ Please wait…' : mode === 'login' ? '→ Sign In' : '→ Create Account'}
                        </motion.button>

                        {mode === 'login' && (
                            <div style={{ marginTop: 4, padding: '10px 14px', borderRadius: 8, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.18)' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>DEMO ACCOUNT</div>
                                <div style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'monospace' }}>arjun@bmtc.in · password123</div>
                            </div>
                        )}
                    </motion.form>
                </AnimatePresence>
            </motion.div>
        </motion.div>
    )
}
