import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert, Wrench } from 'lucide-react';
import type { ActionResult, DesktopAction } from '../../shared/action-schema';

type ActionTimelineProps = {
  plannedActions: DesktopAction[];
  results: ActionResult[];
};

export function ActionTimeline({ plannedActions, results }: ActionTimelineProps) {
  const resultById = new Map(results.map((result) => [result.id, result]));

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
            return (
              <div className="timeline-row" key={action.id}>
                <StatusIcon status={result?.status} />
                <div>
                  <strong>{action.action}</strong>
                  <span>{result?.summary || action.reason || 'Waiting for the local agent.'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusIcon({ status }: { status?: ActionResult['status'] }) {
  if (status === 'success') return <CheckCircle2 className="status-ok" size={18} aria-hidden="true" />;
  if (status === 'needs_confirmation') return <ShieldAlert className="status-warn" size={18} aria-hidden="true" />;
  if (status === 'failed' || status === 'blocked' || status === 'unsupported') {
    return <AlertTriangle className="status-error" size={18} aria-hidden="true" />;
  }
  return <Clock3 className="status-pending" size={18} aria-hidden="true" />;
}

