import { describe, expect, test, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { ConversationStore } from '../src/backend/memory/conversation-store';

const testStorePath = resolve(process.cwd(), '.friday', 'test-conversations.json');

describe('ConversationStore', () => {
  afterEach(async () => {
    try {
      await rm(testStorePath, { force: true });
    } catch {
      // ignore
    }
  });

  test('creates new conversation, appends messages, and lists summaries', async () => {
    const store = new ConversationStore(testStorePath);
    const { conversationId, message } = await store.appendMessage(undefined, 'user', 'Hello FRIDAY');

    expect(conversationId).toBeDefined();
    expect(message.content).toBe('Hello FRIDAY');
    expect(message.role).toBe('user');

    const assistantEntry = await store.appendMessage(conversationId, 'assistant', 'Hello! How can I help?');
    expect(assistantEntry.conversationId).toBe(conversationId);

    const summaries = await store.listSummaries();
    expect(summaries.length).toBe(1);
    expect(summaries[0].id).toBe(conversationId);
    expect(summaries[0].messageCount).toBe(2);

    const messages = await store.getMessages(conversationId);
    expect(messages.length).toBe(2);
  });

  test('deleting a specific conversation removes only that conversation', async () => {
    const store = new ConversationStore(testStorePath);
    const convo1 = await store.appendMessage(undefined, 'user', 'Convo 1');
    const convo2 = await store.appendMessage(undefined, 'user', 'Convo 2');

    const deleted = await store.deleteConversation(convo1.conversationId);
    expect(deleted).toBe(true);

    const summaries = await store.listSummaries();
    expect(summaries.length).toBe(1);
    expect(summaries[0].id).toBe(convo2.conversationId);

    const deletedAgain = await store.deleteConversation('non-existent-id');
    expect(deletedAgain).toBe(false);
  });

  test('clearing all conversations empties the store', async () => {
    const store = new ConversationStore(testStorePath);
    await store.appendMessage(undefined, 'user', 'Convo A');
    await store.appendMessage(undefined, 'user', 'Convo B');

    let summaries = await store.listSummaries();
    expect(summaries.length).toBe(2);

    await store.clearAllConversations();
    summaries = await store.listSummaries();
    expect(summaries.length).toBe(0);
  });
});
