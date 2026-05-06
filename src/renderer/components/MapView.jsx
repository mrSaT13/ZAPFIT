import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';
import L from 'leaflet';

// Компонент для центрирования карты по координатам
function RecenterMap({ positions }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length > 0) {
            const bounds = L.polyline(positions).getBounds();
            map.fitBounds(bounds);
        }
    }, [positions, map]);
    return null;
}

export default function MapView() {
    const [rides, setRides] = useState([]);
    const [selectedRide, setSelectedRide] = useState(null);
    const [route, setRoute] = useState([]);

    useEffect(() => {
        const load = async () => {
            const data = await api.getRides();
            setRides(data);
        };
        load();
    }, []);

    const handleRideSelect = (ride) => {
        setSelectedRide(ride);
        if (ride.points) {
            try {
                // Если данные пришли как строка, парсим. Если уже объект - используем.
                const points = typeof ride.points === 'string' ? JSON.parse(ride.points) : ride.points;
                // Преобразуем точки для Leaflet: [lat, lon]
                const latLngs = points.map(p => [p.lat, p.lon]);
                setRoute(latLngs);
            } catch (e) {
                console.error('Failed to parse points', e);
                setRoute([]);
            }
        } else {
            setRoute([]);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a]">
            {/* Header / Selector */}
            <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Анализ маршрутов</h2>
                <select 
                    className="bg-black/40 border border-white/20 rounded-lg px-4 py-2 text-white outline-none"
                    onChange={(e) => {
                        const ride = rides.find(r => r.id === parseInt(e.target.value));
                        handleRideSelect(ride || null);
                    }}
                >
                    <option value="">Выберите активность...</option>
                    {rides.map(r => (
                        <option key={r.id} value={r.id}>
                            {new Date(r.date).toLocaleDateString()} - {r.title || 'Заезд'}
                        </option>
                    ))}
                </select>
            </div>

            {/* Map Area */}
            <div className="flex-1 relative min-h-[500px]">
                <MapContainer 
                    center={[55.75, 37.61]} 
                    zoom={13} 
                    style={{ height: '100%', width: '100%' }}
                    className="z-10"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {route.length > 0 && (
                        <>
                            <Polyline positions={route} pathOptions={{ color: '#3b82f6', weight: 4 }} />
                            <RecenterMap positions={route} />
                        </>
                    )}
                </MapContainer>
                
                {!selectedRide && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
                        <p className="text-gray-400">Выберите активность из списка выше, чтобы увидеть маршрут</p>
                    </div>
                )}
            </div>
        </div>
    );
}