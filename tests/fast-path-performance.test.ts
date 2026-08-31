import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChat } from '../src/backend/orchestrator/orchestrator';
import { startTask } from '../src/backend/orchestrator/task-executor';
import { TaskStore } from '../src/backend/memory/task-store';
import { ConversationStore } from '../src/backend/memory/conversation-store';
import * as plannerModule from '../src/backend/orchestrator/planner';
import { ModelRouter } from '../src/backend/models/model-router';
import * as agentClientModule from '../src/backend/agent/agent-client';
import type { DesktopAction, ActionResult } from '../src/shared/action-schema';

const fakeAgent = { agentUrl: 'http://localhost:8787', agentToken: 'test-token' };

describe('fast-path-performance', () => {
  let store: ConversationStore;
  let taskStore: TaskStore;

  beforeEach(() => {
    store = new ConversationStore();
    taskStore = new TaskStore();
    vi.restoreAllMocks();
  });


  it('"Open YouTube." executes with 0 LLM calls, 0 planner calls, and 0 screenshots', async () => {
    const plannerSpy = vi.spyOn(plannerModule, 'planComputerActions');
    const routerSpy = vi.spyOn(ModelRouter.prototype, 'execute');
    const agentSpy = vi.spyOn(agentClientModule, 'executeAgentAction').mockResolvedValue({
      id: 'act-1',
      action: 'open_url',
      status: 'success',
      summary: 'Opened https://www.youtube.com',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });

    const response = await handleChat(
      { message: 'Open YouTube.' },
      { agent: fakeAgent, store }
    );

    expect(plannerSpy).not.toHaveBeenCalled();
    expect(routerSpy).not.toHaveBeenCalled();
    expect(agentSpy).toHaveBeenCalledOnce();
    expect(agentSpy.mock.calls[0][0].action).toBe('open_url');
    expect(agentSpy.mock.calls[0][0].action).not.toBe('read_screen');

    expect(response.message.content).toBe('Opened YouTube.');
    expect(response.plannedActions).toHaveLength(1);
    expect(response.plannedActions[0].action).toBe('open_url');
  });

  it('"Open Calculator." executes with 0 LLM calls and 0 screenshots', async () => {
    const plannerSpy = vi.spyOn(plannerModule, 'planComputerActions');
    const routerSpy = vi.spyOn(ModelRouter.prototype, 'execute');
    const agentSpy = vi.spyOn(agentClientModule, 'executeAgentAction').mockResolvedValue({
      id: 'act-2',
      action: 'open_app',
      status: 'success',
      summary: 'Opened Calculator.',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });

    const response = await handleChat(
      { message: 'Open Calculator.' },
      { agent: fakeAgent, store }
    );

    expect(plannerSpy).not.toHaveBeenCalled();
    expect(routerSpy).not.toHaveBeenCalled();
    expect(agentSpy).toHaveBeenCalledOnce();
    expect(agentSpy.mock.calls[0][0].action).toBe('open_app');
    expect(response.message.content).toBe('Opened Calculator.');
  });

  it('compound request "Open YouTube and search Python" falls back to planner', async () => {
    const plannerSpy = vi.spyOn(plannerModule, 'planComputerActions').mockReturnValue([]);

    await handleChat(
      { message: 'Open YouTube and search for Python.' },
      { agent: fakeAgent, store }
    );

    expect(plannerSpy).toHaveBeenCalledOnce();
  });

  it('startTask with simple command executes directly without planner', async () => {
    const plannerSpy = vi.spyOn(plannerModule, 'planComputerActions');
    const runAction = vi.fn().mockResolvedValue({
      id: 'a1',
      action: 'open_url',
      status: 'success',
      summary: 'Opened YouTube.',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });

    const task = await startTask(
      { goal: 'Open YouTube' },
      { agent: fakeAgent, taskStore, onEvent: () => {}, runAction }
    );

    expect(plannerSpy).not.toHaveBeenCalled();
    expect(runAction).toHaveBeenCalledOnce();
    expect(task.status).toBe('completed');
    expect(task.actions[0].action).toBe('open_url');
  });
});
