import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths for bundlers
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function DraggableMarker({ position, onChange }) {
  const [pos, setPos] = useState(position);
  const markerRef = useRef(null);

  useEffect(() => {
    setPos(position);
  }, [position]);

  useMapEvents({
    click(e) {
      const p = e.latlng;
      const next = { lat: p.lat, lon: p.lng };
      setPos(next);
      onChange?.(next);
    }
  });

  return (
    <Marker
      draggable
      eventHandlers={{
        dragend: () => {
          const marker = markerRef.current;
          if (marker) {
            const p = marker.getLatLng();
            const next = { lat: p.lat, lon: p.lng };
            setPos(next);
            onChange?.(next);
          }
        }
      }}
      position={[pos.lat, pos.lon]}
      ref={markerRef}
    />
  );
}

export default function MapPicker({
  initial,
  onConfirm,
  onCancel,
  height = 360
}) {
  const [pos, setPos] = useState(initial);

  useEffect(() => {
    setPos(initial);
  }, [initial]);

  const center = useMemo(() => [pos.lat || 12.9716, pos.lon || 77.5946], [pos]);

  return (
    <div>
      <div style={{ height, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <DraggableMarker position={{ lat: center[0], lon: center[1] }} onChange={setPos} />
        </MapContainer>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="welcome-action" onClick={() => onConfirm?.(pos)}>Confirm Location</button>
        <button className="welcome-action outline" onClick={onCancel}>Cancel</button>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Drag the pin to the exact shop door.</div>
    </div>
  );
}
