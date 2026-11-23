import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import clsx from 'clsx';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MAP_ATTRIBUTION, MAP_DEFAULT, MAP_TILE_URL } from '../../lib/constants.js';

// Vite rewrites asset URLs, which breaks Leaflet's default icon path detection.
// Import the images explicitly and build the icons from them.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export const customerIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export const technicianIcon = L.divIcon({
  className: '',
  html: '<span class="rh-tech-pin" aria-hidden="true"><span></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Keeps every marker in view when positions change. */
function FitToMarkers({ points }) {
  const map = useMap();
  // Re-fit only after a ~1 km change, so a gliding live marker does not make the map jump.
  const key = points.map((p) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`).join('|');
  useEffect(() => {
    const list = key ? key.split('|').map((s) => s.split(',').map(Number)) : [];
    if (list.length === 0) return;
    if (list.length === 1) {
      map.setView(list[0], Math.max(map.getZoom(), 14));
      return;
    }
    map.fitBounds(L.latLngBounds(list), { padding: [40, 40], maxZoom: 16 });
  }, [key, map]);
  return null;
}

const ANIMATION_MS = 900;

/**
 * A marker that glides to each new position (ease-out over ~0.9 s) instead of jumping.
 * Jumps immediately when the user prefers reduced motion.
 */
function SmoothMarker({ lat, lng, icon, label }) {
  const ref = useRef(null);
  const [initial] = useState([lat, lng]);

  useEffect(() => {
    const marker = ref.current;
    if (!marker) return undefined;
    const from = marker.getLatLng();
    const to = L.latLng(lat, lng);
    if (from.equals(to)) return undefined;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      marker.setLatLng(to);
      return undefined;
    }
    const startedAt = performance.now();
    let frame;
    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / ANIMATION_MS);
      const eased = 1 - (1 - t) ** 3;
      marker.setLatLng([
        from.lat + (to.lat - from.lat) * eased,
        from.lng + (to.lng - from.lng) * eased,
      ]);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lat, lng]);

  return (
    <Marker ref={ref} position={initial} icon={icon ?? customerIcon} title={label}>
      {label && (
        <Tooltip direction="top" offset={[0, -12]}>
          {label}
        </Tooltip>
      )}
    </Marker>
  );
}

/**
 * A Leaflet map with OpenStreetMap tiles. markers: [{ id, lat, lng, icon?, label?, animate? }].
 * `animate: true` makes a marker glide between positions (live technician pin).
 * onTileError lets callers offer manual coordinates when tiles cannot load.
 */
export function MapView({
  center,
  zoom = 13,
  markers = [],
  fit = true,
  className,
  onTileError,
  children,
  ariaLabel = 'Map',
}) {
  const start = center ?? markers[0] ?? MAP_DEFAULT;
  return (
    <div
      className={clsx('overflow-hidden rounded-xl border border-slate-200', className)}
      role="region"
      aria-label={ariaLabel}
    >
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={zoom}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          url={MAP_TILE_URL}
          attribution={MAP_ATTRIBUTION}
          eventHandlers={onTileError ? { tileerror: onTileError } : undefined}
        />
        {markers.map((m) =>
          m.animate ? (
            <SmoothMarker key={m.id} lat={m.lat} lng={m.lng} icon={m.icon} label={m.label} />
          ) : (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              icon={m.icon ?? customerIcon}
              title={m.label}
            >
              {m.label && (
                <Tooltip direction="top" offset={[0, -12]}>
                  {m.label}
                </Tooltip>
              )}
            </Marker>
          ),
        )}
        {fit && <FitToMarkers points={markers} />}
        {children}
      </MapContainer>
    </div>
  );
}

export default MapView;
