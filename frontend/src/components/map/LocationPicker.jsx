import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import toast from 'react-hot-toast';
import { Crosshair, Keyboard } from 'lucide-react';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { MAP_ATTRIBUTION, MAP_DEFAULT, MAP_TILE_URL } from '../../lib/constants.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { customerIcon } from './MapView.jsx';

function ClickToPlace({ onPick }) {
  useMapEvents({
    click: (e) => onPick({ lng: e.latlng.lng, lat: e.latlng.lat }),
  });
  return null;
}

function Recenter({ value }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15));
  }, [value?.lat, value?.lng, map]);
  return null;
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const validLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
const validLng = (v) => Number.isFinite(v) && v >= -180 && v <= 180;

/**
 * Pick a point by clicking or dragging the marker, using GPS, or typing coordinates.
 * value / onChange use { lng, lat } (never a bare array). If map tiles fail to load, the manual
 * latitude and longitude inputs open automatically.
 */
export function LocationPicker({ value, onChange, height = 'h-72', error }) {
  const geo = useGeolocation();
  const [tileFailed, setTileFailed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ lat: '', lng: '' });
  const [manualError, setManualError] = useState('');
  const failures = useRef(0);
  const showManual = manualOpen || tileFailed;

  useEffect(() => {
    if (value) setManual({ lat: String(round6(value.lat)), lng: String(round6(value.lng)) });
  }, [value]);

  const set = (point) => onChange({ lng: round6(point.lng), lat: round6(point.lat) });

  const markerHandlers = useMemo(
    () => ({
      dragend: (e) => {
        const ll = e.target.getLatLng();
        set({ lng: ll.lng, lat: ll.lat });
      },
    }),
    [onChange],
  );

  const useMyLocation = async () => {
    try {
      const pos = await geo.locate();
      set(pos);
      toast.success('Location found. Drag the pin if it is not exact.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const applyManual = () => {
    const lat = Number(manual.lat);
    const lng = Number(manual.lng);
    if (!validLat(lat))
      return setManualError('Latitude must be between -90 and 90 (Kathmandu is about 27.7).');
    if (!validLng(lng))
      return setManualError('Longitude must be between -180 and 180 (Kathmandu is about 85.3).');
    setManualError('');
    set({ lng, lat });
    return undefined;
  };

  const start = value ?? MAP_DEFAULT;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={Crosshair}
          onClick={useMyLocation}
          loading={geo.isLocating}
        >
          Use my current location
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={Keyboard}
          onClick={() => setManualOpen((o) => !o)}
          aria-expanded={showManual}
        >
          Enter coordinates
        </Button>
      </div>
      {geo.error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          {geo.error}
        </p>
      )}

      {!tileFailed && (
        <div
          className={`${height} overflow-hidden rounded-xl border ${error ? 'border-red-400' : 'border-slate-200'}`}
        >
          <MapContainer
            center={[start.lat, start.lng]}
            zoom={value ? 15 : 12}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              url={MAP_TILE_URL}
              attribution={MAP_ATTRIBUTION}
              eventHandlers={{
                tileerror: () => {
                  failures.current += 1;
                  if (failures.current >= 4) setTileFailed(true);
                },
                tileload: () => {
                  failures.current = 0;
                },
              }}
            />
            <ClickToPlace onPick={set} />
            <Recenter value={value} />
            {value && (
              <Marker
                position={[value.lat, value.lng]}
                draggable
                icon={customerIcon}
                eventHandlers={markerHandlers}
                title="Repair location (drag to adjust)"
              />
            )}
          </MapContainer>
        </div>
      )}
      {!tileFailed && (
        <p className="text-xs text-slate-500">
          Click the map to drop a pin, then drag it to the exact spot.
        </p>
      )}
      {tileFailed && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          The map could not load. Enter the latitude and longitude instead.
        </p>
      )}

      {showManual && (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input
            label="Latitude"
            inputMode="decimal"
            placeholder="27.7172"
            value={manual.lat}
            onChange={(e) => setManual((m) => ({ ...m, lat: e.target.value }))}
          />
          <Input
            label="Longitude"
            inputMode="decimal"
            placeholder="85.3240"
            value={manual.lng}
            onChange={(e) => setManual((m) => ({ ...m, lng: e.target.value }))}
          />
          <Button variant="secondary" onClick={applyManual}>
            Set location
          </Button>
          {manualError && (
            <p className="text-sm font-medium text-red-600 sm:col-span-3" role="alert">
              {manualError}
            </p>
          )}
        </div>
      )}

      {value && (
        <p className="text-xs text-slate-500">
          Selected: lat {round6(value.lat)}, lng {round6(value.lng)}
        </p>
      )}
      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default LocationPicker;
