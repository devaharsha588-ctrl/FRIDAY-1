import { describe, expect, test } from 'vitest';
import { classifyTask } from '../src/backend/ai/task-classifier';

describe('classifyTask', () => {
  test('routes desktop requests to computer', () => {
    expect(classifyTask('Open Notepad and type hello')).toBe('computer');
  });

  test('routes explicit waits to computer', () => {
    expect(classifyTask('wait 1 second')).toBe('computer');
  });

  test('routes code requests to coding', () => {
    expect(classifyTask('Fix this TypeScript build error')).toBe('coding');
  });

  test('routes visual screen requests to vision', () => {
    expect(classifyTask('Read the screenshot and explain what failed')).toBe('vision');
  });
});
