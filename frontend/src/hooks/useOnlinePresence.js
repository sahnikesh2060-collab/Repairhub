/* global document */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as techniciansApi from '../api/technicians.api.js';
import { distanceMeters } from '../lib/geo.js';
import { queryKeys } from '../lib/queryKeys.js';

const SEND_EVERY_MS = 60_000;
const MOVE_THRESHOLD_M = 200;
const HIDDEN_STOP_MS = 5 * 60_000;

/**
 * While the technician is online: watch GPS and PATCH /technicians/me/location every 60 s, or
 * sooner after moving more than 200 m. Stops when offline, and after the tab has been hidden
 * for 5 minutes (resumes when it is visible again).
 */
export function useOnlinePresence(online) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!online || typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return undefined;
    }
    let lastSent = null;
    let latest = null;
    let watchId = null;
    let hiddenTimer = null;
    let sending = false;

    const send = async (pos) => {
      if (sending) return;
      sending = true;
      lastSent = { ...pos, at: Date.now() };
      try {
        const result = await techniciansApi.updateLocation(pos);
        if (!result.ignored) {
          queryClient.setQueryData(queryKeys.technicianMe, (old) =>
            old
              ? {
                  ...old,
                  profile: {
                    ...old.profile,
                    currentLocation: result.currentLocation,
                    lastLocationAt: result.lastLocationAt,
                  },
                }
              : old,
          );
        }
      } catch (_err) {
        // Network blips are retried on the next tick.
      } finally {
        sending = false;
      }
    };

    const onPosition = (p) => {
      latest = { lng: p.coords.longitude, lat: p.coords.latitude };
      const due = !lastSent || Date.now() - lastSent.at >= SEND_EVERY_MS;
      if (due || distanceMeters(lastSent, latest) > MOVE_THRESHOLD_M) send(latest);
    };

    const start = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(onPosition, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 20_000,
      });
    };
    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };

    // watchPosition may stay quiet while standing still; resend the last fix every minute.
    const tick = setInterval(() => {
      if (watchId !== null && latest && Date.now() - (lastSent?.at ?? 0) >= SEND_EVERY_MS) {
        send(latest);
      }
    }, 15_000);

    const onVisibility = () => {
      if (document.hidden) {
        hiddenTimer = setTimeout(stop, HIDDEN_STOP_MS);
      } else {
        clearTimeout(hiddenTimer);
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      clearInterval(tick);
      clearTimeout(hiddenTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [online, queryClient]);
}
