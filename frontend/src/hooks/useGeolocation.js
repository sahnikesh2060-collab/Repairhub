import { useCallback, useState } from 'react';

const MESSAGES = {
  1: 'Location permission was denied. Allow location access in your browser settings, or pick the spot on the map.',
  2: 'Your location is unavailable right now. Check that location services are on, or pick the spot on the map.',
  3: 'Finding your location took too long. Try again, or pick the spot on the map.',
};

/**
 * locate() resolves { lng, lat, accuracy } or rejects with a user-readable message.
 * Browsers only allow geolocation on https or localhost.
 */
export function useGeolocation() {
  const [state, setState] = useState({ status: 'idle', error: null, position: null });

  const locate = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
          const message = 'This browser cannot share your location. Pick the spot on the map.';
          setState({ status: 'error', error: message, position: null });
          reject(new Error(message));
          return;
        }
        setState((s) => ({ ...s, status: 'loading', error: null }));
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const position = {
              lng: pos.coords.longitude,
              lat: pos.coords.latitude,
              accuracy: pos.coords.accuracy,
            };
            setState({ status: 'success', error: null, position });
            resolve(position);
          },
          (err) => {
            const message = MESSAGES[err.code] ?? 'Could not get your location.';
            setState({ status: 'error', error: message, position: null });
            reject(new Error(message));
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  return { ...state, isLocating: state.status === 'loading', locate };
}
