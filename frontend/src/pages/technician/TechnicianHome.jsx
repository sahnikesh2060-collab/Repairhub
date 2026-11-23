/* global window */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Circle, Marker, Tooltip } from 'react-leaflet';
import {
  Briefcase,
  CalendarDays,
  Map as MapIcon,
  Radar,
  Star,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import * as categoriesApi from '../../api/categories.api.js';
import * as techniciansApi from '../../api/technicians.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import { useSocket } from '../../hooks/useSocket.js';
import { browserTzOffsetMinutes, fromPoint } from '../../lib/geo.js';
import { firstName, formatMoney } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { MapView, customerIcon, technicianIcon } from '../../components/map/MapView.jsx';
import { AvailabilityToggle } from '../../components/technician/AvailabilityToggle.jsx';
import { RequestCard } from '../../components/technician/RequestCard.jsx';
import { ScheduleFormModal } from '../../components/technician/ScheduleFormModal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState } from '../../components/ui/EmptyState.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { StatTile } from '../../components/ui/StatTile.jsx';

const SOUND_KEY = 'repairhub:request-sound';

function readSoundPref() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch (_err) {
    return true;
  }
}

/** A short two-tone chime via Web Audio (no asset needed). */
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
    setTimeout(() => ctx.close(), 800);
  } catch (_err) {
    // Audio is optional.
  }
}

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

export default function TechnicianHome() {
  const { profile, message, receivesJobs } = useOutletContext();
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [sound, setSound] = useState(readSoundPref);
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: categoriesApi.listCategories,
    staleTime: 5 * 60_000,
  });
  const iconByKey = Object.fromEntries((categories.data ?? []).map((c) => [c.key, c.icon]));

  const earnings = useQuery({
    queryKey: queryKeys.earnings,
    queryFn: () => techniciansApi.earnings(browserTzOffsetMinutes()),
  });
  const nearby = useQuery({
    queryKey: queryKeys.nearbyRequests,
    queryFn: techniciansApi.nearbyRequests,
    refetchInterval: 60_000,
  });
  const requests = [...(nearby.data?.requests ?? [])].sort(byNewest);

  const removeRequest = useCallback(
    (bookingId) => {
      queryClient.setQueryData(queryKeys.nearbyRequests, (old) =>
        old ? { ...old, requests: old.requests.filter((r) => r.bookingId !== bookingId) } : old,
      );
    },
    [queryClient],
  );

  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (payload) => {
      queryClient.setQueryData(queryKeys.nearbyRequests, (old) => {
        const list = old?.requests ?? [];
        if (list.some((r) => r.bookingId === payload.bookingId)) return old;
        const card = { ...payload, _id: payload.bookingId, isNew: true };
        return { ...(old ?? { meta: {} }), requests: [card, ...list] };
      });
      if (soundRef.current) playChime();
    };
    const onGone = (payload) => removeRequest(payload.bookingId);
    socket.on('new_repair_request', onNew);
    socket.on('booking_taken', onGone);
    socket.on('booking_cancelled', onGone);
    return () => {
      socket.off('new_repair_request', onNew);
      socket.off('booking_taken', onGone);
      socket.off('booking_cancelled', onGone);
    };
  }, [socket, queryClient, removeRequest]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch (_err) {
      // Preference only lasts for this visit.
    }
  };

  const me = fromPoint(profile.currentLocation);
  const e = earnings.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="rh-brand-gradient relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl px-6 py-7 text-white shadow-(--shadow-lift) sm:px-8">
        <div className="rh-dots pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Namaste, {firstName(user.name)}</h1>
          <p className="mt-1 text-blue-50">{message}</p>
        </div>
        <div className="relative rounded-full bg-white/15 p-1 ring-1 ring-white/25">
          <AvailabilityToggle profile={profile} />
        </div>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Your numbers">
        <StatTile
          label="Today"
          icon={Wallet}
          tone="green"
          loading={earnings.isLoading}
          value={formatMoney(e?.today.total ?? 0)}
          hint={`${e?.today.count ?? 0} jobs`}
        />
        <StatTile
          label="This month"
          icon={CalendarDays}
          loading={earnings.isLoading}
          value={formatMoney(e?.month.total ?? 0)}
          hint={`${e?.month.count ?? 0} jobs`}
        />
        <StatTile
          label="Completed jobs"
          icon={Briefcase}
          tone="violet"
          loading={earnings.isLoading}
          value={e?.allTime.count ?? 0}
        />
        <StatTile
          label="Rating"
          icon={Star}
          tone="amber"
          loading={earnings.isLoading}
          value={(e?.ratingAvg ?? 0).toFixed(1)}
          hint={`${e?.ratingCount ?? 0} reviews`}
        />
      </section>
      {earnings.isError && (
        <div className="mt-3">
          <ErrorState
            error={earnings.error}
            onRetry={earnings.refetch}
            title="Could not load earnings"
          />
        </div>
      )}

      <section className="mt-10" aria-labelledby="nearby-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="nearby-heading" className="text-lg font-semibold text-slate-900">
              Nearby requests
            </h2>
            <p className="text-sm text-slate-500">
              Within {profile.serviceRadiusKm} km of your location · new requests appear live
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={sound ? Volume2 : VolumeX}
              onClick={toggleSound}
              aria-pressed={sound}
            >
              {sound ? 'Sound on' : 'Sound off'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={MapIcon}
              onClick={() => setShowMap((s) => !s)}
              aria-pressed={showMap}
            >
              {showMap ? 'Hide map' : 'Show map'}
            </Button>
          </div>
        </div>

        {showMap && me && (
          <MapView
            className="mt-4 h-80"
            center={me}
            zoom={12}
            fit={false}
            markers={[
              { id: 'me', ...me, icon: technicianIcon, label: 'You' },
              ...requests
                .filter((r) => r.approxLocation)
                .map((r) => ({
                  id: r.bookingId,
                  ...r.approxLocation,
                  icon: customerIcon,
                  label: `${r.title} (approximate)`,
                })),
            ]}
            ariaLabel="Your service area and nearby requests"
          >
            <Circle
              center={[me.lat, me.lng]}
              radius={profile.serviceRadiusKm * 1000}
              pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.06 }}
            />
            <Marker position={[me.lat, me.lng]} icon={technicianIcon}>
              <Tooltip>Your location</Tooltip>
            </Marker>
          </MapView>
        )}

        <div className="mt-4">
          {nearby.isLoading && <SkeletonList count={3} />}
          {nearby.isError && <ErrorState error={nearby.error} onRetry={nearby.refetch} />}
          {nearby.data && requests.length === 0 && (
            <EmptyState
              icon={Radar}
              title={
                receivesJobs ? 'No open requests nearby right now' : 'You are not receiving jobs'
              }
              description={
                receivesJobs
                  ? 'Keep this page open; new requests in your area pop up here instantly.'
                  : message
              }
            />
          )}
          {requests.length > 0 && (
            <ul className="space-y-3" aria-live="polite">
              {requests.map((r) => (
                <li key={r.bookingId}>
                  <RequestCard
                    request={r}
                    categoryIcon={iconByKey[r.category]}
                    onOpen={setSelected}
                    now={now}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ScheduleFormModal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        bookingId={selected?.bookingId}
        mode="accept"
        defaultFee={profile.visitFee}
        onTaken={removeRequest}
        onDone={(booking) => {
          removeRequest(booking._id);
          navigate(`/technician/jobs/${booking._id}`);
        }}
      />
    </div>
  );
}
