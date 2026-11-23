import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import * as techniciansApi from '../../api/technicians.api.js';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Spinner } from '../ui/Spinner.jsx';

/**
 * Large Online/Offline switch. It always reflects the server's answer: going online first asks
 * for GPS once and PATCHes the location, then PATCHes availability.
 */
export function AvailabilityToggle({ profile }) {
  const queryClient = useQueryClient();
  const geo = useGeolocation();
  const online = Boolean(profile?.isAvailable);

  const mutation = useMutation({
    mutationFn: async (next) => {
      if (next) {
        try {
          const pos = await geo.locate();
          await techniciansApi.updateLocation({ lng: pos.lng, lat: pos.lat });
        } catch (err) {
          if (!profile?.currentLocation) throw err;
          toast(`Using your last saved location. ${err.message}`, { icon: '📍' });
        }
      }
      return techniciansApi.setAvailability(next);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.technicianMe, (old) => ({ ...(old ?? {}), ...result }));
      queryClient.invalidateQueries({ queryKey: queryKeys.nearbyRequests });
      if (result.receivesJobs) toast.success(result.message);
      else toast(result.message, { icon: result.profile.isAvailable ? '⏳' : '💤' });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      aria-label={online ? 'You are online. Go offline' : 'You are offline. Go online'}
      onClick={() => mutation.mutate(!online)}
      disabled={mutation.isPending}
      className={clsx(
        'inline-flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 text-base font-bold shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-70',
        online ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700',
      )}
    >
      <span
        className={clsx(
          'flex h-9 w-9 items-center justify-center rounded-full bg-white shadow transition-transform',
          online ? 'text-green-600' : 'text-slate-400',
        )}
      >
        {mutation.isPending ? (
          <Spinner size="sm" />
        ) : (
          <span
            className={clsx('h-3 w-3 rounded-full', online ? 'bg-green-500' : 'bg-slate-400')}
          />
        )}
      </span>
      {online ? 'Online' : 'Offline'}
    </button>
  );
}

export default AvailabilityToggle;
