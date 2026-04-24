// Shared API service — talks to json-server on port 3001
const BASE = 'http://localhost:3001'

// Helper: wraps fetch with a human-readable connection error
async function apiFetch(url, options = {}) {
    try {
        const res = await fetch(url, options)
        if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
        }
        if (res.status === 204) return null   // DELETE returns 204 No Content
        return res.json()
    } catch (err) {
        if (err instanceof TypeError && err.message.includes('fetch')) {
            throw new Error('Cannot reach database. Make sure the DB server is running on port 3001.')
        }
        throw err
    }
}

export async function getRoutes() {
    return apiFetch(`${BASE}/routes`)
}

export async function getBuses() {
    return apiFetch(`${BASE}/buses`)
}

export async function getBookings(userEmail) {
    const url = userEmail
        ? `${BASE}/bookings?user=${encodeURIComponent(userEmail)}`
        : `${BASE}/bookings`
    return apiFetch(url)
}

export async function createBooking(booking) {
    return apiFetch(`${BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(booking)
    })
}

export async function cancelBooking(id) {
    return apiFetch(`${BASE}/bookings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' })
    })
}
