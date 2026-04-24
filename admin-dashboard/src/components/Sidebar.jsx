const NAV = [
    { id: 'overview', label: 'Overview', icon: '📊', desc: 'Fleet analytics' },
    { id: 'fleet', label: 'Bus Fleet', icon: '🚌', desc: 'Manage buses' },
    { id: 'routes', label: 'Route Management', icon: '🗺', desc: 'Manage routes' },
    { id: 'staff', label: 'Staff & Labour', icon: '👷', desc: 'Manage staff' },
    { id: 'scanner', label: 'AI Scanner', icon: '🤖', desc: 'Seat detection' },
]

const nowStr = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export default function Sidebar({ active, onNavigate, user, onLogout }) {
    return (
        <aside style={{
            width: 220,
            minHeight: '100vh',
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto',
        }}>
            {/* Logo area */}
            <div style={{
                padding: '20px 16px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
            }}>
                <div style={{
                    width: 38, height: 38, borderRadius: 11,
                    background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                    boxShadow: '0 3px 14px var(--gold-glow)'
                }}>🚌</div>
                <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--gold)', lineHeight: 1.1 }}>BMTC</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2, textTransform: 'uppercase' }}>Admin Panel</div>
                </div>
            </div>

            {/* Section label */}
            <div style={{ padding: '18px 16px 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
                Navigation
            </div>

            {/* Nav items */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
                {NAV.map(n => (
                    <button key={n.id}
                        className={`nav-item ${active === n.id ? 'active' : ''}`}
                        style={{ justifyContent: 'flex-start', width: '100%', textAlign: 'left' }}
                        onClick={() => onNavigate(n.id)}
                        title={n.desc}
                    >
                        <span style={{ fontSize: 17, flexShrink: 0 }}>{n.icon}</span>
                        <span style={{ fontSize: 14 }}>{n.label}</span>
                    </button>
                ))}
            </nav>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Live indicator */}
            <div style={{
                margin: '8px 16px',
                background: 'rgba(94,220,138,0.08)',
                border: '1px solid rgba(94,220,138,0.18)',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
            }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', animation: 'pulse-dot 1.5s infinite' }} />
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>System Online</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, fontFamily: 'monospace' }}>Updated {nowStr()}</div>
                </div>
            </div>

            {/* User footer */}
            <div style={{
                padding: '14px 16px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 13, color: '#1a1206', flexShrink: 0
                    }}>{user?.name?.[0] || 'A'}</div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Admin'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email || 'admin@bmtc.in'}</div>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    style={{
                        width: '100%', padding: '7px 0', borderRadius: 8, border: '1px solid rgba(255,95,95,0.25)',
                        background: 'rgba(255,95,95,0.07)', color: 'var(--red)', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit'
                    }}
                    onMouseEnter={e => e.target.style.background = 'rgba(255,95,95,0.15)'}
                    onMouseLeave={e => e.target.style.background = 'rgba(255,95,95,0.07)'}
                >
                    ⎋ Sign Out
                </button>
            </div>

            <style>{`
              @keyframes pulse-dot {
                0%,100% { opacity:1; transform:scale(1) }
                50% { opacity:0.4; transform:scale(0.8) }
              }
            `}</style>
        </aside>
    )
}
