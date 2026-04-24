import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { connectors, webrtc } from '@roboflow/inference-sdk'
import { getBuses, updateBus } from '../services/api'

const ROBOFLOW_API_KEY = 'zVvLiWzoQ9tohiNzcgBR'
const WORKSPACE = 'dhansuh'
const WORKFLOW_ID = 'detect-count-and-visualize-2'
const VIDEO_OUTPUT = 'output_image'

const SEAT_ROWS = 9
const SEAT_COLS = ['A', 'B', 'C', 'D']

/**
 * Build a per-seat occupancy map from Roboflow predictions.
 * Works with models that output BOTH occupied+unoccupied labels (full map)
 * OR only occupied labels (rest of seats default to free).
 */
function buildSeatMapFromPreds(preds, totalSeats = SEAT_ROWS * SEAT_COLS.length) {
    if (!preds || !preds.length) return null

    const isOcc = p => {
        const c = (p.class ?? p.class_name ?? '').toLowerCase()
        return c === 'occupied' || c === 'person' || c === 'passenger'
    }
    const isFree = p => {
        const c = (p.class ?? p.class_name ?? '').toLowerCase()
        return c === 'unoccupied' || c === 'empty' || c === 'vacant' || c === 'free'
    }

    const occPreds  = preds.filter(isOcc)
    const freePreds = preds.filter(isFree)

    // If model only outputs occupied boxes: mark only those seats, rest default free
    const hasBothLabels = occPreds.length > 0 && freePreds.length > 0
    const allSeatPreds  = hasBothLabels
        ? [
            ...occPreds.map(p => ({ ...p, _occ: true })),
            ...freePreds.map(p => ({ ...p, _occ: false }))
          ]
        : occPreds.map(p => ({ ...p, _occ: true }))

    if (allSeatPreds.length === 0) return null

    // Sort top-to-bottom, then left-to-right within each group of 4
    allSeatPreds.sort((a, b) => (a.y ?? 0) - (b.y ?? 0))
    const sorted = []
    for (let i = 0; i < allSeatPreds.length; i += 4) {
        const chunk = allSeatPreds.slice(i, i + 4)
        chunk.sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
        sorted.push(...chunk)
    }

    const seatIds = []
    for (let r = 1; r <= SEAT_ROWS; r++) for (const c of SEAT_COLS) seatIds.push(`${r}${c}`)

    const seatMap = {}
    seatIds.forEach(id => { seatMap[id] = 'free' }) // default all to free
    if (hasBothLabels) {
        // Full per-seat map: assign each prediction to its position
        sorted.forEach((p, i) => { if (i < seatIds.length) seatMap[seatIds[i]] = p._occ ? 'occupied' : 'free' })
    } else {
        // Occupied-only: mark the N most confident/prominent seats occupied
        sorted.forEach((p, i) => { if (i < seatIds.length) seatMap[seatIds[i]] = 'occupied' })
    }
    return seatMap
}

/**
 * Extract predictions array from any Roboflow SDK data shape.
 * The WebRTC onData payload varies by SDK version and workflow type.
 */
function extractPreds(data) {
    // Try every known path
    const candidates = [
        data?.serialized_output_data?.predictions?.value,
        data?.predictions?.value,
        data?.predictions,
        data?.serialized_output_data?.predictions,
        data?.output?.predictions,
    ]
    for (const c of candidates) {
        if (!c) continue
        if (Array.isArray(c)) return c
        if (Array.isArray(c?.predictions)) return c.predictions
    }
    return null
}

/**
 * Extract occupied count from any Roboflow SDK data shape.
 * Falls back to counting 'occupied'/'person' predictions if available.
 */
function countOccupied(data) {
    // 1. Try raw predictions from any path
    const arr = extractPreds(data)
    if (arr && arr.length > 0) {
        const occupied = arr.filter(p => {
            const cls = (p.class ?? p.class_name ?? '').toLowerCase()
            return cls === 'occupied' || cls === 'person' || cls === 'passenger'
        })
        return { count: occupied.length, preds: arr }
    }

    // 2. Try count_objects from multiple paths
    const cntCandidates = [
        data?.serialized_output_data?.count_objects?.value,
        data?.count_objects?.value,
        data?.count_objects,
        data?.serialized_output_data?.count_objects,
    ]
    for (const c of cntCandidates) {
        if (c !== undefined && c !== null && !Number.isNaN(Number(c))) {
            return { count: Number(c), preds: [] }
        }
    }

    return null
}

export default function Scanner() {
    // Bus state
    const [buses, setBuses] = useState([])
    const [selectedBusId, setSelectedBusId] = useState('')

    // Stream state
    const [mode, setMode] = useState('idle') // idle | video | webcam
    const [processing, setProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [frameCount, setFrameCount] = useState(0)
    const [currentFrame, setCurrentFrame] = useState(null)
    const [detectedCount, setDetectedCount] = useState(null)
    const [predictions, setPredictions] = useState([])
    const [syncStatus, setSyncStatus] = useState(null) // null | 'syncing' | 'ok' | 'error'
    const [detectedSeatMap, setDetectedSeatMap] = useState(null)
    const [manualCount, setManualCount] = useState('')
    const [error, setError] = useState('')
    const [log, setLog] = useState([])

    const connectionRef = useRef(null)
    const webcamRef = useRef(null)
    const streamRef = useRef(null)
    const lastSyncRef = useRef(0)      // timestamp of last DB sync — throttle to 1 per 4s
    const lastCountRef = useRef(null)  // last pushed count — skip unchanged

    // Load buses on mount
    useEffect(() => {
        getBuses().then(bs => {
            setBuses(bs)
            if (bs.length > 0) setSelectedBusId(bs[0].id)
        }).catch(() => setError('Cannot load buses. Make sure DB server is on port 3001.'))
    }, [])

    const addLog = useCallback((msg, type = 'info') => {
        const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        setLog(prev => [...prev.slice(-49), { ts, msg, type }])
    }, [])

    // Push occupancy + per-seat map to DB
    const syncToDb = useCallback(async (count, preds = []) => {
        if (!selectedBusId) return
        const bus = buses.find(b => b.id === selectedBusId)
        if (!bus) return
        const clamped = Math.min(count, bus.seats)
        const seatMap = buildSeatMapFromPreds(preds)
        if (seatMap) setDetectedSeatMap(seatMap)
        setSyncStatus('syncing')
        try {
            await updateBus(selectedBusId, {
                occupied: clamped,
                scanner: 'Online',
                status: clamped >= bus.seats ? 'Full' : clamped > 0 ? 'On Route' : 'Starting',
                ...(seatMap ? { seatMap } : {})
            })
            setSyncStatus('ok')
            addLog(
                seatMap
                    ? `DB updated → ${selectedBusId}: ${clamped}/${bus.seats} occupied · seat map pushed ✓`
                    : `DB updated → ${selectedBusId}: ${clamped}/${bus.seats} seats occupied`,
                'ok'
            )
            setTimeout(() => setSyncStatus(null), 2000)
        } catch {
            setSyncStatus('error')
            addLog('DB sync failed', 'warn')
        }
    }, [selectedBusId, buses, addLog])

    // ── Video file processing ───────────────────────────────────────────────
    async function processFile(file) {
        if (!selectedBusId) { setError('Please select a bus first.'); return }
        setError('')
        setProcessing(true)
        setFrameCount(0)
        setCurrentFrame(null)
        setDetectedCount(null)
        setMode('video')
        lastSyncRef.current = 0
        lastCountRef.current = null
        addLog(`Starting video analysis: ${file.name}`)

        const connector = connectors.withApiKey(ROBOFLOW_API_KEY, { serverUrl: 'https://serverless.roboflow.com' })

        connectionRef.current = await webrtc.useVideoFile({
            file,
            connector,
            wrtcParams: {
                workspaceName: WORKSPACE,
                workflowId: WORKFLOW_ID,
                streamOutputNames: [],
                dataOutputNames: [VIDEO_OUTPUT, 'count_objects', 'predictions'].filter((v, i, a) => a.indexOf(v) === i),
                processingTimeout: 3600,
                requestedPlan: 'webrtc-gpu-medium',
                requestedRegion: 'us',
                realtimeProcessing: false
            },
            onData: (data) => {
                setFrameCount(n => n + 1)

                const viz = data.serialized_output_data?.[VIDEO_OUTPUT]
                if (viz?.value) setCurrentFrame(`data:image/jpeg;base64,${viz.value}`)

                const result = countOccupied(data)
                if (result !== null) {
                    setDetectedCount(result.count)
                    setManualCount(String(result.count))
                    // Throttle DB sync: max once every 4 seconds to avoid flooding
                    const now = Date.now()
                    if (now - lastSyncRef.current >= 4000) {
                        lastSyncRef.current = now
                        lastCountRef.current = result.count
                        syncToDb(result.count, result.preds)
                        if (result.preds.length > 0) {
                            const occ = result.preds.filter(p => (p.class ?? '').toLowerCase() === 'occupied').length
                            const unocc = result.preds.filter(p => (p.class ?? '').toLowerCase() === 'unoccupied').length
                            addLog(`Occupied: ${occ} | Unoccupied: ${unocc} | Total: ${result.preds.length}`, 'ok')
                        } else {
                            addLog(`Detected: ${result.count} occupied`, 'ok')
                        }
                        setPredictions(result.preds)
                    }
                }
            },
            onUploadProgress: (sent, total) => {
                setProgress(Math.round((sent / total) * 100))
            },
            onComplete: () => {
                setProcessing(false)
                addLog('Video analysis complete ✓', 'ok')
            }
        })
    }

    // ── Webcam streaming ────────────────────────────────────────────────────
    async function startWebcam() {
        if (!selectedBusId) { setError('Please select a bus first.'); return }
        setError('')
        setMode('webcam')
        setProcessing(true)
        setFrameCount(0)
        setCurrentFrame(null)
        setDetectedCount(null)
        addLog('Starting webcam stream…')

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
            streamRef.current = stream
            if (webcamRef.current) webcamRef.current.srcObject = stream
            lastSyncRef.current = 0
            lastCountRef.current = null

            const connector = connectors.withApiKey(ROBOFLOW_API_KEY, { serverUrl: 'https://serverless.roboflow.com' })

            // SDK uses useStream (not useWebcam) — pass the MediaStream as source
            connectionRef.current = await webrtc.useStream({
                source: stream,
                connector,
                wrtcParams: {
                    workspaceName: WORKSPACE,
                    workflowId: WORKFLOW_ID,
                    streamOutputNames: [],
                    dataOutputNames: [VIDEO_OUTPUT, 'count_objects', 'predictions'].filter((v, i, a) => a.indexOf(v) === i),
                    processingTimeout: 3600,
                    requestedPlan: 'webrtc-gpu-medium',
                    requestedRegion: 'us',
                    realtimeProcessing: true
                },
                onData: (data) => {
                    setFrameCount(n => n + 1)

                    const viz = data.serialized_output_data?.[VIDEO_OUTPUT]
                    if (viz?.value) setCurrentFrame(`data:image/jpeg;base64,${viz.value}`)

                    const result = countOccupied(data)
                    if (result !== null) {
                        setDetectedCount(result.count)
                        // Throttle DB sync: max once every 4s, or immediately when count changes
                        const now = Date.now()
                        const countChanged = result.count !== lastCountRef.current
                        if (countChanged || now - lastSyncRef.current >= 4000) {
                            lastSyncRef.current = now
                            lastCountRef.current = result.count
                            setManualCount(String(result.count))
                            syncToDb(result.count, result.preds)
                            if (result.preds.length > 0) {
                                const occ = result.preds.filter(p => (p.class ?? '').toLowerCase() === 'occupied').length
                                const unocc = result.preds.filter(p => (p.class ?? '').toLowerCase() === 'unoccupied').length
                                addLog(`Occupied: ${occ} | Unoccupied: ${unocc}`, 'ok')
                            }
                            setPredictions(result.preds)
                        }
                    }
                },
                hooks: {
                    onComplete: () => {
                        setProcessing(false)
                        addLog('Webcam stream ended', 'info')
                    }
                }
            })
        } catch (e) {
            setProcessing(false)
            setError(`Webcam error: ${e.message}`)
            addLog(`Webcam error: ${e.message}`, 'warn')
        }
    }

    function stopProcessing() {
        connectionRef.current?.stop?.()
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
        setProcessing(false)
        setMode('idle')
        addLog('Processing stopped')
    }

    const selectedBus = buses.find(b => b.id === selectedBusId)
    const occupancyPct = selectedBus && detectedCount !== null
        ? Math.min(100, Math.round((detectedCount / selectedBus.seats) * 100))
        : null

    return (
        <div className="fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>AI Seat Scanner</h1>
                    <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                        Powered by <span style={{ color: 'var(--purple)', fontWeight: 700 }}>Roboflow</span> — real-time seat occupancy detection
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                        fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20,
                        background: processing ? 'rgba(94,220,138,0.14)' : 'rgba(255,255,255,0.06)',
                        border: processing ? '1px solid rgba(94,220,138,0.35)' : '1px solid var(--border)',
                        color: processing ? 'var(--green)' : 'var(--muted)',
                        display: 'flex', alignItems: 'center', gap: 6
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: processing ? 'var(--green)' : 'var(--muted)', display: 'inline-block', animation: processing ? 'pulse-dot 1.2s infinite' : 'none' }} />
                        {processing ? 'DETECTING' : 'IDLE'}
                    </span>
                </div>
            </div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 9, background: 'rgba(255,95,95,0.10)', border: '1px solid rgba(255,95,95,0.28)', color: 'var(--red)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                        ⚠️ {error}
                        <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
                {/* Left — Video */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Video feed */}
                    <div style={{ position: 'relative', background: '#050508', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16/9' }}>
                        {currentFrame ? (
                            <img src={currentFrame} alt="Detection" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                <span style={{ fontSize: 48 }}>🎥</span>
                                <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                                    {mode === 'webcam' ? 'Connecting to webcam…' : 'Upload a video or start webcam'}
                                </span>
                                {mode === 'webcam' && <video ref={webcamRef} autoPlay muted style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, objectFit: 'cover', opacity: 0.4 }} />}
                            </div>
                        )}

                        {/* Overlays */}
                        {processing && (
                            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 6, background: 'rgba(94,220,138,0.85)', color: '#000', backdropFilter: 'blur(4px)' }}>
                                    ● LIVE
                                </span>
                                {detectedCount !== null && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 6, background: 'rgba(0,0,0,0.75)', color: 'var(--gold)', backdropFilter: 'blur(4px)' }}>
                                        👥 {detectedCount} detected
                                    </span>
                                )}
                            </div>
                        )}

                        {syncStatus && (
                            <div style={{ position: 'absolute', top: 10, right: 10 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 6, backdropFilter: 'blur(4px)',
                                    background: syncStatus === 'ok' ? 'rgba(94,220,138,0.85)' : syncStatus === 'error' ? 'rgba(255,95,95,0.85)' : 'rgba(201,168,76,0.85)',
                                    color: '#000' }}>
                                    {syncStatus === 'ok' ? '✓ DB synced' : syncStatus === 'error' ? '✗ Sync failed' : '⟳ Syncing…'}
                                </span>
                            </div>
                        )}

                        {mode === 'video' && processing && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.1)' }}>
                                <motion.div animate={{ width: `${progress}%` }} style={{ height: '100%', background: 'var(--gold)' }} />
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {/* Video file */}
                        <label style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 18px', borderRadius: 9, border: '1px solid rgba(167,139,250,0.35)',
                            background: 'rgba(167,139,250,0.10)', color: 'var(--purple)', fontSize: 13, fontWeight: 700,
                            cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.5 : 1, transition: 'all 0.2s'
                        }}>
                            📁 Upload Video
                            <input type="file" accept="video/*" style={{ display: 'none' }} disabled={processing}
                                onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} />
                        </label>

                        {/* Webcam */}
                        <button onClick={startWebcam} disabled={processing}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid rgba(94,220,138,0.35)', background: 'rgba(94,220,138,0.10)', color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.5 : 1, transition: 'all 0.2s', fontFamily: 'inherit' }}>
                            📷 Live Webcam
                        </button>

                        {/* Stop */}
                        {processing && (
                            <button onClick={stopProcessing}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 9, border: '1px solid rgba(255,95,95,0.35)', background: 'rgba(255,95,95,0.10)', color: 'var(--red)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                ⏹ Stop
                            </button>
                        )}

                        {/* Status chip */}
                        {processing && (
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>
                                {mode === 'video' && `Upload: ${progress}% · `}Frames: {frameCount}
                            </div>
                        )}
                        {!processing && frameCount > 0 && (
                            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--green)' }}>✓ Processed {frameCount} frames</span>
                        )}
                    </div>

                    {/* Detection log */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Detection Log</div>
                        <div style={{ height: 100, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {log.length === 0 ? (
                                <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'monospace' }}>Waiting for activity…</span>
                            ) : [...log].reverse().map((l, i) => (
                                <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', lineHeight: 1.7 }}>
                                    <span style={{ color: 'var(--gold)' }}>[{l.ts}]</span>{' '}
                                    <span style={{ color: l.type === 'ok' ? 'var(--green)' : l.type === 'warn' ? 'var(--red)' : 'var(--muted)' }}>{l.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right — Controls & Stats */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Bus selector */}
                    <div className="card">
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Target Bus</div>
                        <select
                            className="input"
                            value={selectedBusId}
                            onChange={e => setSelectedBusId(e.target.value)}
                            style={{ width: '100%', marginBottom: 10 }}
                            disabled={processing}
                        >
                            {buses.map(b => (
                                <option key={b.id} value={b.id}>{b.id} — {b.route}</option>
                            ))}
                        </select>
                        {selectedBus && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--muted)' }}>Current occupancy</span>
                                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{selectedBus.occupied}/{selectedBus.seats}</span>
                                </div>
                                <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${(selectedBus.occupied / selectedBus.seats) * 100}%`, background: selectedBus.occupied >= selectedBus.seats ? 'var(--red)' : 'var(--green)', borderRadius: 3, transition: 'width 0.5s' }} />
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <span className={`badge ${selectedBus.scanner === 'Online' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>
                                        {selectedBus.scanner === 'Online' ? '● Online' : '○ Offline'}
                                    </span>
                                    <span className={`badge ${selectedBus.status === 'On Route' ? 'badge-green' : selectedBus.status === 'Full' ? 'badge-red' : 'badge-gold'}`} style={{ fontSize: 10 }}>
                                        {selectedBus.status}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Live detection result */}
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>Detected Occupancy</div>
                        <motion.div
                            key={detectedCount}
                            initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            style={{ fontSize: 56, fontWeight: 900, lineHeight: 1,
                                color: occupancyPct === null ? 'var(--muted)' : occupancyPct >= 90 ? 'var(--red)' : occupancyPct >= 60 ? 'var(--gold)' : 'var(--green)' }}
                        >
                            {detectedCount === null ? '—' : detectedCount}
                        </motion.div>
                        {occupancyPct !== null && (
                            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
                                {occupancyPct}% of {selectedBus?.seats || '?'} seats
                            </div>
                        )}
                        {/* Progress ring */}
                        {occupancyPct !== null && (
                            <div style={{ marginTop: 14 }}>
                                <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                                    <motion.div
                                        animate={{ width: `${occupancyPct}%` }} transition={{ duration: 0.5 }}
                                        style={{ height: '100%', borderRadius: 4, background: occupancyPct >= 90 ? 'var(--red)' : occupancyPct >= 60 ? 'var(--gold)' : 'var(--green)' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Manual Override — always visible ───────────────── */}
                    <div className="card">
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                            Manual Override
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
                            Set exact occupied count and push to DB — visible in user app instantly.
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                            <input
                                type="number"
                                min={0}
                                max={selectedBus?.seats ?? 60}
                                value={manualCount}
                                onChange={e => setManualCount(e.target.value)}
                                placeholder={`0 – ${selectedBus?.seats ?? 60}`}
                                className="input"
                                style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 16 }}
                            />
                            <motion.button
                                className="btn"
                                whileTap={{ scale: 0.95 }}
                                disabled={manualCount === '' || !selectedBusId || syncStatus === 'syncing'}
                                onClick={() => {
                                    const n = Math.max(0, Math.min(Number(manualCount), selectedBus?.seats ?? 60))
                                    setManualCount(String(n))
                                    setDetectedCount(n)
                                    syncToDb(n, [])
                                    addLog(`Manual push → ${selectedBusId}: ${n} occupied`, 'ok')
                                }}
                                style={{
                                    padding: '0 18px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                                    background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                                    color: '#1a1206', border: 'none', cursor: 'pointer',
                                    opacity: (manualCount === '' || !selectedBusId) ? 0.45 : 1
                                }}
                            >
                                {syncStatus === 'syncing' ? '⟳' : '⬆ Push'}
                            </motion.button>
                        </div>
                        {syncStatus === 'ok' && (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)' }}>✓ Pushed — user app updated</div>
                        )}
                        {syncStatus === 'error' && (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)' }}>✗ Push failed — check DB</div>
                        )}
                    </div>

                    {/* Model info */}
                    <div className="card" style={{ fontSize: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Roboflow Model</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {[
                                ['Workspace', WORKSPACE],
                                ['Workflow', WORKFLOW_ID],
                                ['Plan', 'webrtc-gpu-medium'],
                                ['Region', 'US'],
                                ['Outputs', 'count_objects, predictions'],
                            ].map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                                    <span style={{ color: 'var(--gold)', fontFamily: 'monospace', fontSize: 11, textAlign: 'right' }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Per-seat map — live mirror of what user app sees */}
                    <div className="card">
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Seat Map — User App View</span>
                            {detectedSeatMap && (
                                <span style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(94,220,138,0.12)', border: '1px solid rgba(94,220,138,0.3)' }}>● PUSHED</span>
                            )}
                        </div>
                        {detectedSeatMap ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {Array.from({ length: SEAT_ROWS }, (_, ri) => (
                                    <div key={ri + 1} style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: 8, color: 'var(--muted)', width: 10, textAlign: 'right', fontFamily: 'monospace' }}>{ri + 1}</span>
                                        {SEAT_COLS.slice(0, 2).map(col => {
                                            const id = `${ri + 1}${col}`
                                            const occ = detectedSeatMap[id] === 'occupied'
                                            return (
                                                <div key={id} title={id} style={{
                                                    width: 22, height: 15, borderRadius: 3,
                                                    background: occ ? 'rgba(255,95,95,0.55)' : 'rgba(94,220,138,0.22)',
                                                    border: `1px solid ${occ ? 'rgba(255,95,95,0.7)' : 'rgba(94,220,138,0.5)'}`,
                                                    fontSize: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: occ ? '#ff5f5f' : '#5edc8a', fontFamily: 'monospace'
                                                }}>{id}</div>
                                            )
                                        })}
                                        <div style={{ width: 6 }} />
                                        {SEAT_COLS.slice(2).map(col => {
                                            const id = `${ri + 1}${col}`
                                            const occ = detectedSeatMap[id] === 'occupied'
                                            return (
                                                <div key={id} title={id} style={{
                                                    width: 22, height: 15, borderRadius: 3,
                                                    background: occ ? 'rgba(255,95,95,0.55)' : 'rgba(94,220,138,0.22)',
                                                    border: `1px solid ${occ ? 'rgba(255,95,95,0.7)' : 'rgba(94,220,138,0.5)'}`,
                                                    fontSize: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: occ ? '#ff5f5f' : '#5edc8a', fontFamily: 'monospace'
                                                }}>{id}</div>
                                            )
                                        })}
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'center' }}>
                                    <span style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--muted)' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,95,95,0.55)', border: '1px solid rgba(255,95,95,0.7)', display: 'inline-block' }} />
                                        Occupied
                                    </span>
                                    <span style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--muted)' }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(94,220,138,0.22)', border: '1px solid rgba(94,220,138,0.5)', display: 'inline-block' }} />
                                        Free
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
                                {predictions.length > 0
                                    ? 'Model outputs count only — seat-level map unavailable'
                                    : 'Start scanning to see per-seat map'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
