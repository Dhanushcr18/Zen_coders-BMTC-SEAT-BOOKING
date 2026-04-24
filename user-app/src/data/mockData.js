// Mock data for routes, buses and bookings
export const routes = [
    {
        id: 'R001',
        name: 'Majestic → Whitefield',
        stops: ['Majestic', 'Shivajinagar', 'Indiranagar', 'MG Road', 'Whitefield'],
        duration: '75 min',
        distance: '28 km',
        fare: 45,
        path: [
            [12.978, 77.572], [12.984, 77.598], [12.979, 77.636],
            [12.975, 77.605], [12.970, 77.750]
        ]
    },
    {
        id: 'R002',
        name: 'Kempegowda → Electronic City',
        stops: ['Kempegowda', 'Silk Board', 'Bommanahalli', 'Electronic City'],
        duration: '55 min',
        distance: '20 km',
        fare: 35,
        path: [
            [12.978, 77.572], [12.917, 77.623], [12.900, 77.630], [12.845, 77.665]
        ]
    },
    {
        id: 'R003',
        name: 'Yeshwanthpur → Koramangala',
        stops: ['Yeshwanthpur', 'Rajajinagar', 'Basavanagudi', 'Koramangala'],
        duration: '60 min',
        distance: '22 km',
        fare: 40,
        path: [
            [13.024, 77.551], [12.997, 77.555], [12.948, 77.574], [12.934, 77.624]
        ]
    },
]

export const buses = [
    { id: 'KA-01-F-1234', route: 'R001', driver: 'Rajesh Kumar', seats: 40, occupied: 27, status: 'On Route', eta: '8 min' },
    { id: 'KA-02-G-5678', route: 'R002', driver: 'Venkat Rao', seats: 40, occupied: 15, status: 'On Route', eta: '12 min' },
    { id: 'KA-03-H-9012', route: 'R003', driver: 'Suresh Nair', seats: 36, occupied: 36, status: 'Full', eta: '3 min' },
    { id: 'KA-04-J-3456', route: 'R001', driver: 'Mohan Das', seats: 40, occupied: 5, status: 'Starting', eta: '22 min' },
    { id: 'KA-05-K-7890', route: 'R002', driver: 'Prakash B', seats: 36, occupied: 20, status: 'On Route', eta: '18 min' },
]

export const myBookings = [
    { id: 'BK001', route: 'Majestic → Whitefield', bus: 'KA-01-F-1234', seat: '12A', date: 'Today, 6:30 PM', fare: 45, status: 'Confirmed' },
    { id: 'BK002', route: 'Kempegowda → Electronic City', bus: 'KA-02-G-5678', seat: '5B', date: 'Tomorrow, 8:00 AM', fare: 35, status: 'Upcoming' },
    { id: 'BK003', route: 'Yeshwanthpur → Koramangala', bus: 'KA-03-H-9012', seat: '23A', date: 'Feb 18, 5:00 PM', fare: 40, status: 'Completed' },
]
