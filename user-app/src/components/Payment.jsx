import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function Payment({ amount = 45, routeName = '', onClose }) {
    const [status, setStatus] = useState('idle') // idle | processing | success

    const handlePay = () => {
        // Razorpay checkout integration
        if (typeof window !== 'undefined' && window.Razorpay) {
            const options = {
                key: 'rzp_test_YOUR_KEY_HERE', // Replace with actual key
                amount: amount * 100, // paise
                currency: 'INR',
                name: 'BMTC Smart Transit',
                description: `Ticket: ${routeName}`,
                image: '🚌',
                handler: function (response) {
                    console.log('Payment success', response)
                    setStatus('success')
                },
                prefill: { name: 'Bangalore User', email: 'user@bmtc.in', contact: '9876543210' },
                theme: { color: '#C9A84C' },
                modal: { ondismiss: () => setStatus('idle') }
            }
            const rzp = new window.Razorpay(options)
            rzp.open()
        } else {
            // Simulate payment when Razorpay SDK not loaded
            setStatus('processing')
            setTimeout(() => setStatus('success'), 2000)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)', padding: 20 }}
        >
            <motion.div
                className="glass" style={{ width: '100%', maxWidth: 400, padding: '36px 32px', position: 'relative' }}
                initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
            >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

                <button onClick={onClose}
                    style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20 }}>✕</button>

                <AnimatePresence mode="wait">
                    {status === 'success' ? (
                        <motion.div key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', marginBottom: 8 }}>Payment Successful!</div>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>₹{amount} paid for {routeName}</div>
                            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Transaction ID</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                    TXN{Date.now().toString(36).toUpperCase()}
                                </div>
                            </div>
                            <button className="btn-gold" style={{ width: '100%' }} onClick={onClose}>View Booking</button>
                        </motion.div>
                    ) : (
                        <motion.div key="pay">
                            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                                <div style={{ fontSize: 36, marginBottom: 8 }}>💳</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Secure Checkout</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Powered by Razorpay</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Route</span>
                                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{routeName || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Base Fare</span>
                                    <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>₹{amount - 5}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Convenience Fee</span>
                                    <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>₹5</span>
                                </div>
                                <div style={{ borderTop: '1px solid var(--charcoal-border)', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total</span>
                                    <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--gold)' }}>₹{amount}</span>
                                </div>
                            </div>

                            <motion.button
                                className="btn-gold pulse-gold"
                                style={{ width: '100%', fontSize: 16, padding: '14px 0' }}
                                whileTap={{ scale: 0.97 }}
                                onClick={handlePay}
                                disabled={status === 'processing'}
                            >
                                {status === 'processing' ? '⏳ Processing...' : `Pay ₹${amount} Now →`}
                            </motion.button>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                                {['🔒 SSL Secured', '✅ PCI DSS', '⚡ Instant Booking'].map(t => (
                                    <span key={t} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t}</span>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    )
}
