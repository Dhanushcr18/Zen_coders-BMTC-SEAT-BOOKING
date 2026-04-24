import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Custom gold bus icon
const busIcon = (color = '#C9A84C') => L.divIcon({
    className: '',
    html: `<div style="background:${color};width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 12px rgba(201,168,76,0.5);border:2px solid #fff2;">🚌</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
})

function MapZoomer({ route }) {
    const map = useMap()
    useEffect(() => {
        if (route?.path?.length >= 2) {
            map.flyToBounds(route.path, { padding: [60, 60], duration: 1.2 })
        } else {
            map.flyTo([12.9716, 77.5946], 11, { duration: 1.2 })
        }
    }, [route, map])
    return null
}

// routes prop: array of route objects from the API (with .path, .id, .name, etc.)
// selectedRoute prop: the id string of the selected route
export default function LiveMap({ selectedRoute, routes = [] }) {
    const activeRoute = routes.find(r => r.id === selectedRoute)

    return (
        <div style={{ height: '100%', width: '100%', borderRadius: 16, overflow: 'hidden' }}>
            <MapContainer
                center={[12.9716, 77.5946]}
                zoom={11}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                />
                <MapZoomer route={activeRoute} />

                {routes.map(route => (
                    route.path?.length >= 2 && (
                        <Polyline
                            key={route.id}
                            positions={route.path}
                            pathOptions={{
                                color: route.id === selectedRoute ? '#C9A84C' : '#3a3a50',
                                weight: route.id === selectedRoute ? 4 : 2,
                                opacity: route.id === selectedRoute ? 1 : 0.5
                            }}
                        />
                    )
                ))}

                {routes.flatMap(route =>
                    (route.path?.slice(0, 2) || []).map((pos, i) => (
                        <Marker key={`${route.id}-${i}`} position={pos} icon={busIcon(
                            route.id === selectedRoute ? '#C9A84C' : '#555'
                        )}>
                            <Popup>
                                <div style={{ background: '#16161a', color: '#f0ead6', padding: '8px', borderRadius: 8, fontSize: 13 }}>
                                    <strong style={{ color: '#C9A84C' }}>{route.name}</strong>
                                    <br />{route.duration} · {route.distance}
                                </div>
                            </Popup>
                        </Marker>
                    ))
                )}
            </MapContainer>
        </div>
    )
}
