import { Bot, CircleDot, Router, ShieldCheck } from 'lucide-react';
import type { PublicModelProvider } from '../../shared/chat-contracts';
import type { TaskType } from '../../shared/task-types';
import { taskTypeLabels } from '../../shared/task-types';

type StatusStripProps = {
  taskType: TaskType;
  provider?: PublicModelProvider;
  status: string;
};

export function StatusStrip({ taskType, provider, status }: StatusStripProps) {
  return (
    <div className="status-strip" aria-label="FRIDAY status">
      <div>
        <Bot size={17} aria-hidden="true" />
        <span>{status}</span>
      </div>
      <div>
        <Router size={17} aria-hidden="true" />
        <span>{taskTypeLabels[taskType]}</span>
      </div>
      <div>
        <CircleDot size={17} aria-hidden="true" />
        <span>{provider?.configured ? provider.model : 'No model configured'}</span>
      </div>
      <div>
        <ShieldCheck size={17} aria-hidden="true" />
        <span>Local action layer</span>
      </div>
    </div>
  );
}

