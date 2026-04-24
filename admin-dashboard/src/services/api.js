// Shared API service — talks to json-server on port 3001
const BASE = 'http://localhost:3001'

// Helper: fetch with a connection error hint
async function apiFetch(url, options = {}) {
    try {
        const res = await fetch(url, options)
        if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(`HTTP ${res.status}: ${text || res.statusText}`)
        }
        // 204 No Content (DELETE responses)
        if (res.status === 204) return null
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

export async function createRoute(route) {
    return apiFetch(`${BASE}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(route)
    })
}

export async function updateRoute(id, data) {
    return apiFetch(`${BASE}/routes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
}

export async function deleteRoute(id) {
    return apiFetch(`${BASE}/routes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getBuses() {
    return apiFetch(`${BASE}/buses`)
}

export async function createBus(bus) {
    return apiFetch(`${BASE}/buses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bus)
    })
}

export async function deleteBus(id) {
    return apiFetch(`${BASE}/buses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function updateBus(id, data) {
    return apiFetch(`${BASE}/buses/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
}

export async function getStaff() {
    return apiFetch(`${BASE}/staff`)
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
