import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';

/** Confirmation for destructive or important actions. Extra fields (e.g. a reason) go in children. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  tone = 'danger',
  loading = false,
  confirmDisabled = false,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <p className="text-sm text-slate-600">This cannot be undone.</p>}
    </Modal>
  );
}

export default ConfirmDialog;
