import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Bus: 4 columns (A,B | aisle | C,D), 9 rows
const ROWS = 9
const COLS = ['A', 'B', 'C', 'D']

/**
 * Generate seat map from live DB data.
 * If the scanner has pushed a per-seat seatMap ({ "1A": "occupied"|"free", ... }),
 * use it directly. Otherwise fall back to marking the first N seats as occupied.
 */
function generateSeats(occupiedCount = 0, seatMap = null) {
    const seats = {}
    let filled = 0
    for (let r = 1; r <= ROWS; r++) {
        for (const c of COLS) {
            const id = `${r}${c}`
            if (seatMap && seatMap[id] !== undefined) {
                seats[id] = { id, occupied: seatMap[id] === 'occupied' }
            } else {
                seats[id] = { id, occupied: filled < occupiedCount }
            }
            filled++
        }
    }
    return seats
}

export default function SeatSelector({ routeId, busForRoute, onBook }) {
    const seatMap = busForRoute?.seatMap ?? null
    // Generate initial seat map — uses per-seat data from scanner if available
    const [seats, setSeats] = useState(() => generateSeats(busForRoute?.occupied ?? 0, seatMap))
    const [selected, setSelected] = useState(null)
    const [showConfirm, setShowConfirm] = useState(false)

    const totalSeats = busForRoute?.seats ?? ROWS * COLS.length
    const occupiedCount = seatMap
        ? Object.values(seatMap).filter(v => v === 'occupied').length
        : (busForRoute?.occupied ?? 0)
    const availableCount = totalSeats - occupiedCount

    // Regenerate seat map when scanner pushes new data (10s poll)
    useEffect(() => {
        const map = busForRoute?.seatMap ?? null
        setSeats(generateSeats(busForRoute?.occupied ?? 0, map))
        // Clear selection if the selected seat became occupied
        setSelected(prev => {
            if (!prev) return prev
            const newSeats = generateSeats(busForRoute?.occupied ?? 0, map)
            return newSeats[prev]?.occupied ? null : prev
        })
    }, [busForRoute?.occupied, busForRoute?.seatMap])

    const toggleSeat = (id) => {
        if (seats[id].occupied) return
        setSelected(prev => prev === id ? null : id)
    }

    return (
        <div>
            {/* Legend + live count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--charcoal-border)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Occupied</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid var(--gold)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Available</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--gold)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Selected</span>
                </div>
                {/* Live vacancy chip */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                        background: availableCount === 0 ? 'rgba(255,95,95,0.15)' : availableCount <= 4 ? 'rgba(201,168,76,0.15)' : 'rgba(94,220,138,0.15)',
                        color: availableCount === 0 ? 'var(--red)' : availableCount <= 4 ? 'var(--gold)' : 'var(--green)',
                        border: `1px solid ${availableCount === 0 ? 'rgba(255,95,95,0.3)' : availableCount <= 4 ? 'rgba(201,168,76,0.3)' : 'rgba(94,220,138,0.3)'}`,
                    }}>
                        {availableCount === 0 ? '🔴 Full' : `🟢 ${availableCount} / ${totalSeats} free`}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>LIVE</span>
                </div>
            </div>

            {/* Occupancy bar */}
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 18 }}>
                <motion.div
                    animate={{ width: `${(occupiedCount / totalSeats) * 100}%` }}
                    transition={{ duration: 0.6 }}
                    style={{
                        height: '100%', borderRadius: 3,
                        background: availableCount === 0 ? 'var(--red)' : availableCount <= 4 ? 'var(--gold)' : 'var(--green)'
                    }}
                />
            </div>

            {/* Bus SVG layout */}
            <svg
                viewBox="0 0 220 400"
                style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto' }}
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Bus body */}
                <rect x="5" y="5" width="210" height="390" rx="20" fill="none" stroke="var(--charcoal-border)" strokeWidth="2" />

                {/* Driver area */}
                <rect x="20" y="15" width="80" height="40" rx="8" fill="rgba(201,168,76,0.1)" stroke="var(--gold)" strokeWidth="1" />
                <text x="60" y="40" textAnchor="middle" fill="var(--gold)" fontSize="11" fontFamily="Inter">Driver</text>
                <text x="155" y="40" textAnchor="middle" fill="var(--text-secondary)" fontSize="10" fontFamily="Inter">FRONT</text>

                {/* Column headers */}
                {COLS.map((c, ci) => {
                    const x = ci < 2 ? 30 + ci * 40 : 120 + (ci - 2) * 40
                    return <text key={c} x={x + 12} y={72} textAnchor="middle" fill="var(--text-secondary)" fontSize="11" fontFamily="Inter">{c}</text>
                })}

                {/* Seats */}
                {Array.from({ length: ROWS }, (_, ri) =>
                    COLS.map((c, ci) => {
                        const id = `${ri + 1}${c}`
                        const seat = seats[id]
                        const isSelected = selected === id
                        const x = ci < 2 ? 20 + ci * 40 : 110 + (ci - 2) * 40
                        const y = 80 + ri * 38

                        let fill = 'none'
                        let stroke = 'var(--charcoal-border)'
                        let strokeWidth = 1.5

                        if (seat.occupied) { fill = 'var(--charcoal-border)'; stroke = '#3a3a50' }
                        if (isSelected) { fill = 'var(--gold)'; stroke = 'var(--gold-light)'; strokeWidth = 2 }
                        if (!seat.occupied && !isSelected) { stroke = 'var(--gold)'; strokeWidth = 1.5 }

                        return (
                            <g key={id} onClick={() => toggleSeat(id)} style={{ cursor: seat.occupied ? 'not-allowed' : 'pointer' }}>
                                <rect x={x} y={y} width="32" height="28" rx="6" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
                                <text x={x + 16} y={y + 17} textAnchor="middle" fill={isSelected ? '#1a1206' : seat.occupied ? '#555' : 'var(--gold)'} fontSize="9" fontFamily="Inter">{id}</text>
                            </g>
                        )
                    })
                )}

                {/* Aisle line */}
                <line x1="100" y1="70" x2="100" y2="390" stroke="rgba(255,255,255,0.05)" strokeWidth="2" strokeDasharray="4,4" />
            </svg>

            {/* Book button */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                        style={{ marginTop: 20, padding: 16, background: 'rgba(201,168,76,0.08)', borderRadius: 12, border: '1px solid rgba(201,168,76,0.2)' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Selected Seat</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold)' }}>Seat {selected}</div>
                            </div>
                            <motion.button
                                className="btn-gold"
                                style={{ padding: '10px 20px', fontSize: 14 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => { setShowConfirm(true); onBook?.(selected) }}
                            >
                                Proceed to Pay →
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}
                        onClick={() => setShowConfirm(false)}
                    >
                        <motion.div
                            className="glass" style={{ padding: 32, textAlign: 'center', maxWidth: 360 }}
                            initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>Seat Booked!</div>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Seat <strong style={{ color: 'var(--text-primary)' }}>{selected}</strong> has been reserved.</div>
                            <button className="btn-gold" style={{ width: '100%' }} onClick={() => setShowConfirm(false)}>Done</button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
