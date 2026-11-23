import { Navigation } from 'lucide-react';
import { useNow } from '../../hooks/useNow.js';
import { secondsAgo } from '../../lib/format.js';
import { Card } from '../ui/Card.jsx';
import { MapView, customerIcon, technicianIcon } from '../map/MapView.jsx';

/**
 * Customer pin + technician pin with a rough ETA. Renders nothing until the first live
 * location exists. `destination` is { lng, lat } of the repair location.
 */
export function LiveLocationMap({ destination, liveLocation, technicianName = 'Technician' }) {
  const now = useNow(1000);
  if (!liveLocation) return null;

  const markers = [
    {
      id: 'tech',
      lat: liveLocation.lat,
      lng: liveLocation.lng,
      icon: technicianIcon,
      animate: true,
      label: technicianName,
    },
    ...(destination
      ? [
          {
            id: 'home',
            lat: destination.lat,
            lng: destination.lng,
            icon: customerIcon,
            label: 'Repair location',
          },
        ]
      : []),
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
          <Navigation className="h-4 w-4" aria-hidden />
          {liveLocation.etaMinutes !== undefined && liveLocation.etaMinutes !== null
            ? `About ${liveLocation.etaMinutes} min away (estimate)`
            : `${technicianName} is on the way`}
        </p>
        <p className="text-xs text-slate-500" aria-live="off">
          updated {secondsAgo(liveLocation.updatedAt, now)}
        </p>
      </div>
      <MapView
        markers={markers}
        className="h-72 rounded-none border-0 border-t"
        ariaLabel="Live technician location"
      />
      <p className="px-5 py-2 text-[11px] text-slate-400">
        ETA is a straight-line estimate and does not account for traffic.
      </p>
    </Card>
  );
}

export default LiveLocationMap;
