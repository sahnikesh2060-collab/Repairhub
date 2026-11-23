import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import * as techniciansApi from '../../api/technicians.api.js';
import { fromPoint } from '../../lib/geo.js';
import { formatDateTime } from '../../lib/format.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { LocationPicker } from '../../components/map/LocationPicker.jsx';
import { TechnicianProfileForm } from '../../components/technician/TechnicianProfileForm.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';

export default function TechnicianProfile() {
  const { profile } = useOutletContext();
  const queryClient = useQueryClient();
  const [point, setPoint] = useState(fromPoint(profile.currentLocation));
  const [address, setAddress] = useState(profile.currentLocation?.addressText ?? '');

  const saveLocation = useMutation({
    mutationFn: () =>
      techniciansApi.updateLocation({ ...point, addressText: address.trim() || undefined }),
    onSuccess: (result) => {
      if (result.ignored) {
        toast('Location was updated moments ago; try again in a few seconds.', { icon: '⏱️' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.technicianMe });
      toast.success('Base location saved');
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Technician profile
        </h1>
        {profile.isVerified ? (
          <Badge tone="green">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified
          </Badge>
        ) : (
          <Badge tone="amber">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Pending verification
          </Badge>
        )}
      </div>
      <Card className="mt-6">
        <CardHeader title="Services and pricing" />
        <TechnicianProfileForm profile={profile} />
      </Card>
      <Card className="mt-6">
        <CardHeader
          title="Base location"
          description={
            profile.lastLocationAt
              ? `Last updated ${formatDateTime(profile.lastLocationAt)}`
              : undefined
          }
        />
        <div className="space-y-4">
          <LocationPicker value={point} onChange={setPoint} />
          <Input
            label="Area name (optional)"
            maxLength={300}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button
            onClick={() => saveLocation.mutate()}
            loading={saveLocation.isPending}
            disabled={!point}
          >
            Save location
          </Button>
        </div>
      </Card>
    </div>
  );
}
