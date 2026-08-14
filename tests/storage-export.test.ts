import { beforeEach, describe, expect, it } from 'vitest';
import { createSampleEvent } from '../src/domain/sample';
import { createBlankEvent } from '../src/domain/sample';
import { openDB } from 'idb';
import {
  exportEventJson,
  exportSettlementCsv,
  importEventJson,
  MAX_EVENT_FILE_BYTES,
  validateEventFileSize,
} from '../src/export/data';
import {
  clearDraft,
  deleteSavedDraft,
  listSavedDrafts,
  loadDraft,
  loadPreviousEvent,
  loadSavedDraft,
  MAX_SAVED_DRAFTS,
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

  it('lists, restores, and deletes automatic drafts by activity', async () => {
    const first = { ...createSampleEvent(), title: '春日聚餐' };
    const second = { ...createBlankEvent(), title: '夏夜聚餐' };
    await saveDraft(first);
    await saveDraft(second);

    const drafts = await listSavedDrafts();
    expect(drafts.map((draft) => draft.title)).toEqual(
      expect.arrayContaining(['春日聚餐', '夏夜聚餐']),
    );
    expect(await loadSavedDraft(first.id)).toMatchObject({ id: first.id, title: '春日聚餐' });

    await deleteSavedDraft(first.id);
    expect(await loadSavedDraft(first.id)).toBeUndefined();
    expect(await loadDraft()).toMatchObject({ id: second.id, title: '夏夜聚餐' });
  });

  it('deduplicates rolling and legacy draft records for the same activity', async () => {
    const event = createSampleEvent();
    await savePreviousEvent(event);
    await saveDraft(event);
    await saveDraft({ ...event, title: '同一活动的新名称' });

    const drafts = await listSavedDrafts();
    expect(drafts.filter((draft) => draft.id === event.id)).toHaveLength(1);
    expect(drafts.find((draft) => draft.id === event.id)?.title).toBe('同一活动的新名称');
  });

  it('protects the current automatic draft from individual deletion', async () => {
    const event = createSampleEvent();
    await saveDraft(event);

    await expect(deleteSavedDraft(event.id)).rejects.toThrow('当前正在编辑');
    expect(await loadSavedDraft(event.id)).toBeDefined();
  });

  it('ignores damaged draft-box records without hiding valid activities', async () => {
    const event = createSampleEvent();
    await saveDraft(event);
    const db = await openDB('dining-map-editor', 1);
    await db.put(
      'drafts',
      { kind: 'activity-draft', savedAt: Date.now(), event: { id: 'broken' } },
      'activity:broken',
    );

    const drafts = await listSavedDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe(event.id);
  });

  it('bounds the draft box while keeping the latest current activity', async () => {
    let latest = createBlankEvent();
    for (let index = 0; index < MAX_SAVED_DRAFTS + 2; index += 1) {
      latest = { ...createBlankEvent(), title: `活动 ${index}` };
      await saveDraft(latest);
    }

    const drafts = await listSavedDrafts();
    expect(drafts).toHaveLength(MAX_SAVED_DRAFTS);
    expect(drafts.some((draft) => draft.id === latest.id)).toBe(true);
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
