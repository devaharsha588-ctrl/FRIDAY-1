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
          <strong>Secrets & Keys</strong>
        </div>
        <p className="muted">5 dedicated role key slots (OPENROUTER_KEY_1..5) stay in the backend environment.</p>
      </div>
      <div className="setting-block">
        <div className="setting-title">
          <Cpu size={17} aria-hidden="true" />
          <strong>Multi-Model Architecture (100% Free)</strong>
        </div>
        <div className="provider-list">
          {providers.map((provider) => (
            <div className="provider-row" key={provider.taskType} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{taskTypeLabels[provider.taskType] || provider.taskType}</span>
                {provider.keySlot && <small style={{ color: '#888', fontSize: '0.75rem' }}>{provider.keySlot.toUpperCase()}</small>}
              </div>
              <strong className={provider.configured ? 'configured' : 'missing'} style={{ fontSize: '0.85rem' }}>
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
          <strong>Safety & Cost Guardrails</strong>
        </div>
        <p className="muted">FRIDAY_ALLOW_PAID_MODELS=false is active. Zero cost guaranteed.</p>
      </div>
    </aside>
  );
}
