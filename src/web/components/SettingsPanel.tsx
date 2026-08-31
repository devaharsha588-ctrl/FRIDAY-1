import { Cpu, LockKeyhole, MonitorCog, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { PublicModelProvider } from '../../shared/chat-contracts';
import { taskTypeLabels } from '../../shared/task-types';

type SettingsPanelProps = {
  providers: PublicModelProvider[];
};

export function SettingsPanel({ providers }: SettingsPanelProps) {
  return (
    <aside className="settings-panel">
      <div className="section-heading">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <h2>Settings</h2>
      </div>
      <div className="setting-block">
        <div className="setting-title">
          <LockKeyhole size={17} aria-hidden="true" />
          <strong>Secrets</strong>
        </div>
        <p className="muted">OpenRouter keys stay in the backend environment and are not exposed here.</p>
      </div>
      <div className="setting-block">
        <div className="setting-title">
          <Cpu size={17} aria-hidden="true" />
          <strong>Model routing</strong>
        </div>
        <div className="provider-list">
          {providers.map((provider) => (
            <div className="provider-row" key={provider.taskType}>
              <span>{taskTypeLabels[provider.taskType]}</span>
              <strong className={provider.configured ? 'configured' : 'missing'}>
                {provider.configured ? provider.model : 'Not configured'}
              </strong>
            </div>
          ))}
        </div>
      </div>
      <div className="setting-block">
        <div className="setting-title">
          <MonitorCog size={17} aria-hidden="true" />
          <strong>Agent boundary</strong>
        </div>
        <p className="muted">Desktop control runs through a local authenticated action API.</p>
      </div>
      <div className="setting-block">
        <div className="setting-title">
          <ShieldCheck size={17} aria-hidden="true" />
          <strong>Safety</strong>
        </div>
        <p className="muted">Unknown actions, unlisted apps, outside-root file paths, and destructive requests are blocked.</p>
      </div>
    </aside>
  );
}

