import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, ImageIcon, ShieldAlert, Wrench, XCircle } from 'lucide-react';
import type { ActionResult, DesktopAction } from '../../shared/action-schema';

type ActionTimelineProps = {
  plannedActions: DesktopAction[];
  results: ActionResult[];
  onConfirmAction?: (action: DesktopAction) => Promise<void>;
  onCancelAction?: (actionId: string) => void;
};

export function ActionTimeline({
  plannedActions,
  results,
  onConfirmAction,
  onCancelAction
}: ActionTimelineProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const resultById = new Map(results.map((result) => [result.id, result]));

  async function handleConfirm(action: DesktopAction) {
    if (!onConfirmAction) return;
    setConfirmingId(action.id);
    try {
      await onConfirmAction(action);
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <section className="action-panel" aria-label="Action progress">
      <div className="section-heading">
        <Wrench size={18} aria-hidden="true" />
        <h2>Actions</h2>
      </div>
      {plannedActions.length === 0 ? (
        <p className="muted">No desktop actions planned for this turn.</p>
      ) : (
        <div className="timeline-list">
          {plannedActions.map((action) => {
            const result = resultById.get(action.id);
            const isConfirmationNeeded =
              result?.status === 'needs_confirmation' ||
              (!result && action.requiresConfirmation);

            const dataObj = (result?.data && typeof result.data === 'object') ? (result.data as Record<string, unknown>) : undefined;
            const thumbUrl = (typeof dataObj?.thumbnailBase64 === 'string' ? dataObj.thumbnailBase64 : undefined) ||
              (typeof dataObj?.base64Thumb === 'string' ? dataObj.base64Thumb : undefined);

            return (
              <div className="timeline-card" key={action.id}>
                <div className="timeline-row">
                  <StatusIcon status={result?.status} />
                  <div className="timeline-info">
                    <strong>{formatActionName(action.action)}</strong>
                    <span className="timeline-summary">
                      {result?.summary || action.reason || 'Waiting for the local agent.'}
                    </span>
                  </div>
                </div>

                {isConfirmationNeeded && onConfirmAction && (
                  <div className="confirmation-box" role="alert">
                    <div className="confirmation-header">
                      <ShieldAlert size={16} className="warn-icon" aria-hidden="true" />
                      <strong>Confirmation required</strong>
                    </div>
                    <p className="confirmation-text">
                      {result?.summary || action.reason || `FRIDAY wants to execute ${action.action}.`}
                    </p>
                    <div className="confirmation-actions">
                      <button
                        type="button"
                        className="btn-confirm"
                        disabled={confirmingId === action.id}
                        onClick={() => void handleConfirm(action)}
                      >
                        {confirmingId === action.id ? 'Running...' : 'Confirm & Run'}
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        disabled={confirmingId === action.id}
                        onClick={() => onCancelAction?.(action.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {thumbUrl && (
                  <div className="screenshot-preview">
                    <div className="preview-header">
                      <ImageIcon size={14} aria-hidden="true" />
                      <span>Desktop Screenshot ({String(dataObj?.width || '')}x{String(dataObj?.height || '')})</span>
                    </div>
                    <img
                      src={thumbUrl}
                      alt="Captured desktop screenshot"
                      className="screenshot-img"
                      loading="lazy"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatActionName(action: string): string {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function StatusIcon({ status }: { status?: ActionResult['status'] }) {
  if (status === 'success' || status === 'completed') {
    return <CheckCircle2 className="status-ok" size={18} aria-hidden="true" />;
  }
  if (status === 'needs_confirmation') {
    return <ShieldAlert className="status-warn" size={18} aria-hidden="true" />;
  }
  if (status === 'cancelled') {
    return <XCircle className="status-neutral" size={18} aria-hidden="true" />;
  }
  if (status === 'failed' || status === 'blocked' || status === 'unsupported') {
    return <AlertTriangle className="status-error" size={18} aria-hidden="true" />;
  }
  if (status === 'running') {
    return <Clock3 className="status-running animate-spin" size={18} aria-hidden="true" />;
  }
  return <Clock3 className="status-pending" size={18} aria-hidden="true" />;
}
