import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Textarea } from '../ui/Textarea.jsx';

const MAX = 500;

export function RequestNewTimeDialog({ open, onClose, onSubmit, loading, technicianName }) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title="Ask for another time"
      description={`${technicianName ?? 'The technician'} will propose a new arrival time.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Back
          </Button>
          <Button
            onClick={() => onSubmit(note.trim())}
            loading={loading}
            disabled={note.length > MAX}
          >
            Request new time
          </Button>
        </>
      }
    >
      <Textarea
        label="Note for the technician (optional)"
        placeholder="e.g. After 5 PM please, or any time on Saturday"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        counter={{ value: note.length, max: MAX }}
        error={note.length > MAX ? `Keep it under ${MAX} characters` : undefined}
        rows={3}
        data-autofocus
      />
    </Modal>
  );
}

export default RequestNewTimeDialog;
