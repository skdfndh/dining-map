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
});
