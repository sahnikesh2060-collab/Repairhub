import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { Input } from '../ui/Input.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Textarea } from '../ui/Textarea.jsx';

/** "Complete Job": final cost (required, whole rupees) and a work summary note. */
export function CompleteJobModal({ open, onClose, onSubmit, loading, defaultCost }) {
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setCost(defaultCost !== undefined && defaultCost !== null ? String(defaultCost) : '');
      setNote('');
      setError('');
    }
  }, [open, defaultCost]);

  const submit = () => {
    const value = Number(cost);
    if (cost === '' || !Number.isInteger(value) || value < 0) {
      setError('Enter the final cost as a whole number of rupees.');
      return;
    }
    if (note.length > 500) {
      setError('Keep the summary under 500 characters.');
      return;
    }
    onSubmit({ finalCost: value, note: note.trim() || undefined });
  };

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title="Complete this job"
      description="The customer sees the final cost and is asked for a review."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Back
          </Button>
          <Button onClick={submit} loading={loading}>
            Complete job
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Final cost (NPR)"
          type="number"
          min={0}
          inputMode="numeric"
          required
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          error={error && error.startsWith('Enter') ? error : undefined}
          data-autofocus
        />
        <Textarea
          label="Work summary (optional)"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Replaced capacitor, cleaned filters"
          counter={{ value: note.length, max: 500 }}
          error={error && !error.startsWith('Enter') ? error : undefined}
        />
      </div>
    </Modal>
  );
}

/** "Release Job" with a required reason (3-300 characters). */
export function ReleaseJobDialog({ open, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Release this job?"
      description="It goes back to other nearby technicians and you will not see it again."
      confirmLabel="Release job"
      cancelLabel="Keep job"
      loading={loading}
      onConfirm={() => {
        const r = reason.trim();
        if (r.length < 3 || r.length > 300) {
          setError('Give a reason of 3 to 300 characters.');
          return;
        }
        onConfirm(r);
      }}
    >
      <Textarea
        label="Reason"
        required
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Vehicle broke down"
        counter={{ value: reason.length, max: 300 }}
        error={error || undefined}
        data-autofocus
      />
    </ConfirmDialog>
  );
}
