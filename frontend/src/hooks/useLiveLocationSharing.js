import { useEffect, useState } from 'react';
import { useSocket } from './useSocket.js';

const EMIT_EVERY_MS = 15_000;

/**
 * While `enabled` (booking ON_THE_WAY): follow the device with watchPosition and emit
 * technician_location_update every 15 s (the first fix is sent at once).
 * Returns { lastSentAt, error } for the UI.
 */
export function useLiveLocationSharing(bookingId, enabled) {
  const { socket } = useSocket();
  const [lastSentAt, setLastSentAt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !socket || !bookingId) return undefined;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('This device cannot share its location.');
      return undefined;
    }
    let latest = null;
    let sentFirst = false;

    const emit = () => {
      if (!latest || !socket.connected) return;
      socket.emit('technician_location_update', { bookingId, ...latest }, (ack) => {
        if (ack?.ok && !ack.ignored) setLastSentAt(new Date());
        if (ack && !ack.ok) setError(ack.message ?? 'Location update was refused');
      });
    };

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        latest = { lng: p.coords.longitude, lat: p.coords.latitude };
        setError(null);
        if (!sentFirst) {
          sentFirst = true;
          emit();
        }
      },
      (err) =>
        setError(
          err.code === 1
            ? 'Location permission is blocked, so the customer cannot see you on the map.'
            : 'Waiting for a GPS fix…',
        ),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    const interval = setInterval(emit, EMIT_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(interval);
    };
  }, [bookingId, enabled, socket]);

  return { lastSentAt, error };
}
