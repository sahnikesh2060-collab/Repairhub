import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ShieldAlert } from 'lucide-react';
import * as techniciansApi from '../../api/technicians.api.js';
import { useOnlinePresence } from '../../hooks/useOnlinePresence.js';
import { useTechnicianAccount } from '../../hooks/useTechnicianAccount.js';
import { fromPoint } from '../../lib/geo.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { LocationPicker } from '../../components/map/LocationPicker.jsx';
import { TechnicianProfileForm } from '../../components/technician/TechnicianProfileForm.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ErrorState } from '../../components/ui/EmptyState.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';

function Onboarding({ profile }) {
  const queryClient = useQueryClient();
  const hasProfile = profile.categories?.length > 0;
  const [step, setStep] = useState(hasProfile ? 2 : 1);
  const [point, setPoint] = useState(fromPoint(profile.currentLocation));
  const [address, setAddress] = useState(profile.currentLocation?.addressText ?? '');
  const [saving, setSaving] = useState(false);

  const saveLocation = async () => {
    if (!point) {
      toast.error('Pick your base location first.');
      return;
    }
    setSaving(true);
    try {
      await techniciansApi.updateLocation({ ...point, addressText: address.trim() || undefined });
      await queryClient.invalidateQueries({ queryKey: queryKeys.technicianMe });
      toast.success('All set! Go online to receive nearby jobs.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
        Set up your technician profile
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Step {step} of 2 · {step === 1 ? 'Your services' : 'Your base location'}
      </p>
      <Card className="mt-6">
        {step === 1 ? (
          <TechnicianProfileForm
            profile={profile}
            submitLabel="Save and continue"
            onSaved={() => setStep(2)}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Customers within your service radius of this point will see you. You can update it any
              time; while online it follows your phone&apos;s GPS.
            </p>
            <LocationPicker value={point} onChange={setPoint} />
            <Input
              label="Area name (optional)"
              placeholder="e.g. Koteshwor, Kathmandu"
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={saving}>
                Back
              </Button>
              <Button onClick={saveLocation} loading={saving}>
                Save location and finish
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Wraps every /technician page: loads the technician account, shows onboarding until the
 * profile has categories and a location, shares GPS while online, and shows the
 * verification banner for unverified technicians.
 */
export default function TechnicianArea() {
  const account = useTechnicianAccount();
  const profile = account.data?.profile;
  useOnlinePresence(Boolean(profile?.isAvailable));

  if (account.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (account.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <ErrorState error={account.error} onRetry={account.refetch} />
      </div>
    );
  }
  if (!profile.categories?.length || !profile.currentLocation) {
    return <Onboarding profile={profile} />;
  }

  return (
    <>
      {!profile.isVerified && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
          Pending admin verification. You won&apos;t receive jobs yet.
        </div>
      )}
      <Outlet context={account.data} />
    </>
  );
}
