import { beforeEach, describe, expect, it } from 'vitest';
import { createSampleEvent } from '../src/domain/sample';
import {
  exportEventJson,
  exportSettlementCsv,
  importEventJson,
  MAX_EVENT_FILE_BYTES,
  validateEventFileSize,
} from '../src/export/data';
import {
  clearDraft,
  loadDraft,
  loadPreviousEvent,
  loadSnapshot,
  saveDraft,
  savePreviousEvent,
} from '../src/storage/draft-store';
import {
  clearEditorSession,
  grantEditorSession,
  hasEditorSession,
  verifyPassword,
} from '../src/storage/auth';
import { loadViewerState, saveViewerState } from '../src/storage/viewer-state';
import { EDITOR_PASSWORD_CONFIG } from '../src/config/editor';
import {
  createParticipantFromHistory,
  loadParticipantHistory,
  MAX_PARTICIPANT_HISTORY,
  mergeParticipantHistory,
  participantHistoryInitial,
  PARTICIPANT_HISTORY_STORAGE_KEY,
  saveParticipantHistory,
} from '../src/storage/participant-history';

describe('storage and exchange', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearDraft();
  });

  it('keeps a draft and previous snapshot', async () => {
    const first = createSampleEvent();
    await saveDraft(first);
    const second = { ...first, title: 'updated' };
    await saveDraft(second);
    expect((await loadDraft())?.title).toBe('updated');
    expect((await loadSnapshot())?.title).toBe(first.title);
  });

  it('keeps the previous activity separate from rolling autosave snapshots', async () => {
    const previous = createSampleEvent();
    await savePreviousEvent(previous);
    await saveDraft({ ...previous, id: 'event_new', title: '' });
    await saveDraft({ ...previous, id: 'event_new', title: '新的聚餐' });
    expect((await loadPreviousEvent())?.id).toBe(previous.id);
    expect((await loadPreviousEvent())?.title).toBe(previous.title);
  });

  it('isolates viewer state by activity', () => {
    saveViewerState('one', { participantId: 'p1', arrivedStationIds: [], mode: 'step' });
    expect(loadViewerState('one').participantId).toBe('p1');
    expect(loadViewerState('two').participantId).toBeUndefined();
  });

  it('sanitizes malformed viewer state instead of crashing the map', () => {
    localStorage.setItem(
      'dining-map:viewer:broken',
      JSON.stringify({ arrivedStationIds: 'not-an-array', mode: 'unknown', participantId: 42 }),
    );
    expect(loadViewerState('broken')).toEqual({
      participantId: undefined,
      currentStationId: undefined,
      arrivedStationIds: [],
      mode: 'overview',
      focusedStationId: undefined,
    });
  });

  it('validates password and session expiry', async () => {
    expect(await verifyPassword('dinner', EDITOR_PASSWORD_CONFIG)).toBe(true);
    grantEditorSession(1000);
    expect(hasEditorSession(1001)).toBe(true);
    clearEditorSession();
    expect(hasEditorSession(1001)).toBe(false);
    localStorage.setItem('dining-map:editor-session', 'Infinity');
    expect(hasEditorSession(1001)).toBe(false);
  });

  it('round trips JSON and exports Chinese CSV', () => {
    const event = createSampleEvent();
    expect(importEventJson(exportEventJson(event)).title).toBe(event.title);
    expect(exportSettlementCsv(event)).toContain('小林');
    expect(exportSettlementCsv(event).charCodeAt(0)).toBe(0xfeff);
  });

  it('rejects oversized event files before parsing them', () => {
    expect(() => validateEventFileSize({ size: MAX_EVENT_FILE_BYTES + 1 })).toThrow('超过 5 MB');
  });

  it('sorts participant history by Pinyin initial and keeps noted names distinct', () => {
    const history = mergeParticipantHistory(
      [],
      [
        { name: '张三' },
        { name: '阿周' },
        { name: 'Alice' },
        { name: '小王', note: '大学同学' },
        { name: '小王', note: '邻居' },
        { name: '张三' },
        { name: '3号桌' },
      ],
      100,
    );

    expect(history.map((entry) => participantHistoryInitial(entry.name))).toEqual([
      'A',
      'A',
      'X',
      'X',
      'Z',
      '#',
    ]);
    expect(history.filter((entry) => entry.name === '张三')).toHaveLength(1);
    expect(history.filter((entry) => entry.name === '小王')).toHaveLength(2);
  });

  it('keeps participant history within its local storage bound', () => {
    const history = mergeParticipantHistory(
      [],
      Array.from({ length: MAX_PARTICIPANT_HISTORY + 5 }, (_, index) => ({
        name: `参与人 ${index}`,
      })),
      100,
    );

    expect(history).toHaveLength(MAX_PARTICIPANT_HISTORY);
  });

  it('loads validated participant history and ignores damaged storage', () => {
    saveParticipantHistory([{ name: ' 张三 ', note: ' 同学 ', lastUsedAt: 100 }]);
    expect(loadParticipantHistory()).toEqual([{ name: '张三', note: '同学', lastUsedAt: 100 }]);

    localStorage.setItem(PARTICIPANT_HISTORY_STORAGE_KEY, '{broken');
    expect(loadParticipantHistory()).toEqual([]);
    localStorage.setItem(PARTICIPANT_HISTORY_STORAGE_KEY, JSON.stringify({ name: 'not-an-array' }));
    expect(loadParticipantHistory()).toEqual([]);
  });

  it('creates a fresh current-activity id from a historical choice', () => {
    const entry = { name: '张三', note: '同学', lastUsedAt: 100 };
    const first = createParticipantFromHistory(entry);
    const second = createParticipantFromHistory(entry);

    expect(first).toMatchObject({ name: '张三', note: '同学' });
    expect(first.id).toMatch(/^person_/);
    expect(second.id).not.toBe(first.id);
  });
});
