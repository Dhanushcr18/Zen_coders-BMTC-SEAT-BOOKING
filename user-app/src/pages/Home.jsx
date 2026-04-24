import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const slides = [
    {
        image: '/bmtc_bus_city.png',
        title: 'Bengaluru On The Move',
        subtitle: 'Track live buses across 500+ routes in real-time',
        accent: 'rgba(201,168,76,0.85)',
    },
    {
        image: '/bmtc_bus_depot.png',
        title: 'Fleet of 6,000+ Buses',
        subtitle: 'Serving 5 million commuters across Bengaluru every day',
        accent: 'rgba(107,203,119,0.85)',
    },
    {
        image: '/bmtc_bus_night.png',
        title: 'Night Services Available',
        subtitle: 'Safe and reliable BMTC buses running around the clock',
        accent: 'rgba(120,180,255,0.85)',
    },
]

const features = [
    { icon: '🗺️', title: 'Live Route Tracking', desc: 'See exactly where your bus is in real-time on an interactive Bengaluru map.' },
    { icon: '💺', title: 'Seat Booking', desc: 'Reserve your seat in advance and avoid the rush. Choose your preferred spot.' },
    { icon: '💳', title: 'Instant Payments', desc: 'Pay securely via Razorpay. UPI, cards, and wallets all accepted.' },
    { icon: '🤖', title: 'AI Seat Scanner', desc: 'AI cameras scan occupancy in real-time so you always know seat availability.' },
    { icon: '📍', title: '500+ Routes', desc: 'Comprehensive BMTC route network covering every corner of Bengaluru.' },
    { icon: '🔔', title: 'ETA Alerts', desc: 'Get notified when your bus is approaching your stop.' },
]

const stats = [
    { value: '6,000+', label: 'Buses in Fleet', icon: '🚌' },
    { value: '500+', label: 'Active Routes', icon: '🗺️' },
    { value: '5M+', label: 'Daily Commuters', icon: '👥' },
    { value: '24/7', label: 'Service Hours', icon: '⏰' },
]

export default function Home({ onNavigate }) {
    const [current, setCurrent] = useState(0)
    const [direction, setDirection] = useState(1)

    // Auto-advance carousel every 4s
    useEffect(() => {
        const t = setInterval(() => {
            setDirection(1)
            setCurrent(c => (c + 1) % slides.length)
        }, 4000)
        return () => clearInterval(t)
    }, [])

    const goTo = (idx) => {
        setDirection(idx > current ? 1 : -1)
        setCurrent(idx)
    }

    const variants = {
        enter: (d) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
        center: { x: 0, opacity: 1, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } },
        exit: (d) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0, transition: { duration: 0.45 } }),
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40, paddingBottom: 40 }}>

            {/* ── HERO CAROUSEL ── */}
            <div style={{ position: 'relative', height: 420, borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                <AnimatePresence custom={direction} mode="popLayout">
                    <motion.div
                        key={current}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        style={{ position: 'absolute', inset: 0 }}
                    >
                        {/* Image */}
                        <img
                            src={slides[current].image}
                            alt={slides[current].title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        {/* Gradient overlay */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(to top, rgba(8,8,12,0.92) 0%, rgba(8,8,12,0.4) 50%, rgba(8,8,12,0.1) 100%)'
                        }} />
                        {/* Text */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '30px 36px' }}>
                            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                                <div style={{
                                    display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: 2,
                                    textTransform: 'uppercase', color: slides[current].accent,
                                    background: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: '4px 12px',
                                    border: `1px solid ${slides[current].accent}`, marginBottom: 10
                                }}>BMTC Smart Transit</div>
                                <h2 style={{ fontSize: 34, fontWeight: 900, color: '#fff', margin: '0 0 8px', lineHeight: 1.15 }}>
                                    {slides[current].title}
                                </h2>
                                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                                    {slides[current].subtitle}
                                </p>
                            </motion.div>
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Prev / Next arrows */}
                {[{ d: -1, pos: 'left: 16px' }, { d: 1, pos: 'right: 16px' }].map(({ d, pos }) => (
                    <button key={pos} onClick={() => goTo((current + d + slides.length) % slides.length)} style={{
                        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                        [d === -1 ? 'left' : 'right']: 16,
                        background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, zIndex: 10,
                        backdropFilter: 'blur(6px)', transition: 'background 0.2s'
                    }}>
                        {d === -1 ? '‹' : '›'}
                    </button>
                ))}

                {/* Dot indicators */}
                <div style={{ position: 'absolute', bottom: 20, right: 36, display: 'flex', gap: 6, zIndex: 10 }}>
                    {slides.map((_, i) => (
                        <button key={i} onClick={() => goTo(i)} style={{
                            width: i === current ? 24 : 8, height: 8, borderRadius: 4,
                            background: i === current ? 'var(--gold)' : 'rgba(255,255,255,0.35)',
                            border: 'none', cursor: 'pointer', padding: 0,
                            transition: 'all 0.35s ease'
                        }} />
                    ))}
                </div>
            </div>

            {/* ── STATS STRIP ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                {stats.map((s, i) => (
                    <motion.div key={i} className="glass" style={{ padding: '20px 16px', textAlign: 'center' }}
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>{s.icon}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold)', letterSpacing: -0.5 }}>{s.value}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                    </motion.div>
                ))}
            </div>

            {/* ── ABOUT SECTION ── */}
            <div className="glass" style={{ padding: '28px 32px', borderColor: 'rgba(201,168,76,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🚌</div>
                    <div>
                        <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
                            About BMTC Smart Transit
                        </h3>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
                            The <strong style={{ color: 'var(--gold)' }}>Bruhat Bengaluru Mahanagara Palike Transport Corporation (BMTC)</strong> operates
                            one of India's largest urban bus networks. This Smart Transit app brings Bengaluru's
                            public bus system into the digital age — offering real-time GPS tracking, AI-powered
                            seat occupancy detection, seamless seat booking, and instant digital payments.
                            Whether you're a daily commuter or an occasional traveller, BMTC Smart Transit
                            makes your journey smoother, faster, and smarter.
                        </p>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button className="btn-gold" style={{ fontSize: 13, padding: '9px 18px' }}
                                onClick={() => onNavigate('routes')}>🗺 View Routes</button>
                            <button className="btn-outline" style={{ fontSize: 13, padding: '9px 18px' }}
                                onClick={() => onNavigate('buses')}>🚌 Live Buses</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── FEATURES GRID ── */}
            <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>App Features</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                    {features.map((f, i) => (
                        <motion.div key={i} className="glass" style={{ padding: '20px 18px' }}
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                            whileHover={{ scale: 1.02 }}>
                            <div style={{ fontSize: 30, marginBottom: 10 }}>{f.icon}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{f.title}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{f.desc}</div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* ── QUICK BOOKING CTA ── */}
            <motion.div className="glass" style={{
                padding: '28px 32px', textAlign: 'center',
                background: 'linear-gradient(135deg, rgba(201,168,76,0.08), rgba(107,203,119,0.05))',
                borderColor: 'rgba(201,168,76,0.25)'
            }} whileHover={{ scale: 1.005 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Ready to Ride?</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, maxWidth: 420, margin: '0 auto 20px' }}>
                    Book your seat in under 30 seconds. Real-time availability, instant confirmation.
                </p>
                <button className="btn-gold" style={{ fontSize: 15, padding: '12px 28px' }}
                    onClick={() => onNavigate('routes')}>
                    Book a Seat Now →
                </button>
            </motion.div>
        </div>
    )
}
