import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Eye,
  FileUp,
  History,
  KeyRound,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  DiningEvent,
  EntityId,
  Expense,
  FuzzyPeriod,
  Participant,
  RouteSegment,
  Station,
  StationTime,
  TransportMode,
} from '../domain/types';
import { FUZZY_PERIODS } from '../domain/types';
import { createId } from '../domain/id';
import { removeParticipant } from '../domain/event-mutations';
import { areaSearchRequest, buildArea, citiesFor, districtsFor, provinces } from '../domain/areas';
import { resolveOfflineAreaCenter } from '../domain/area-center';
import { createBlankEvent, createSampleEvent } from '../domain/sample';
import {
  autoSortStations,
  fillSortableUnscheduledStations,
  formatStationTime,
} from '../domain/time';
import { validateEvent } from '../domain/schema';
import { MapCanvas } from '../components/MapCanvas';
import { AmapService } from '../maps/amap-service';
import { parseMapShareLink } from '../maps/link-parser';
import type { PlaceCandidate } from '../maps/types';
import type { MapPickTarget } from '../maps/types';
import { resolveMapPickTarget } from '../maps/pick';
import {
  recalculateRoute,
  recalculateStaleRoutes,
  reconcileRoutes,
  routeIdentity,
} from '../maps/routes';
import {
  clearDraft,
  createDraftAutosaver,
  deleteSavedDraft,
  listSavedDrafts,
  loadDraft,
  loadPreviousEvent,
  loadSavedDraft,
  saveDraft,
  savePreviousEvent,
  type SavedDraftSummary,
} from '../storage/draft-store';
import {
  clearEditorSession,
  derivePasswordDigest,
  grantEditorSession,
  hasEditorSession,
  verifyPassword,
} from '../storage/auth';
import {
  createParticipantFromHistory,
  loadParticipantHistory,
  mergeParticipantHistory,
  participantHistoryInitial,
  participantHistoryKey,
  saveParticipantHistory,
  type ParticipantHistoryEntry,
} from '../storage/participant-history';
import { EDITOR_PASSWORD_CONFIG } from '../config/editor';
import {
  downloadText,
  exportEventJson,
  exportSettlementCsv,
  importEventJson,
  validateEventFileSize,
} from '../export/data';
import { calculateExpense, calculateSettlement } from '../settlement/calculate';
import { formatYuan, parseYuan } from '../settlement/money';

const mapService = new AmapService();
const autosave = createDraftAutosaver(650);
const modeNames: Record<TransportMode, string> = {
  walking: '步行',
  cycling: '骑行',
  driving: '驾车',
  taxi: '打车',
  transit: '公共交通',
  custom: '自定义',
};

function updateById<T extends { id: string }>(items: T[], id: string, update: Partial<T>): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...update } : item));
}
function emptyParticipant(): Participant {
  return { id: createId('person'), name: '新参与人' };
}
function stationFromCandidate(
  candidate: Partial<PlaceCandidate>,
  coordinate = candidate.coordinate,
): Station {
  return {
    id: createId('station'),
    shortName: candidate.name?.slice(0, 8) || '新地点',
    name: candidate.name || '新地点',
    address: candidate.address || '',
    coordinate: coordinate ?? { lng: 121.47, lat: 31.23, system: 'GCJ02' },
    poiId: candidate.poiId,
    start: { kind: 'pending' },
    participantIds: [],
  };
}

export function EditorApp() {
  const [authenticated, setAuthenticated] = useState(hasEditorSession());
  if (!authenticated) return <LoginGate onSuccess={() => setAuthenticated(true)} />;
  return (
    <EditorWorkspace
      onLogout={() => {
        clearEditorSession();
        setAuthenticated(false);
      }}
    />
  );
}

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const valid = await verifyPassword(password, EDITOR_PASSWORD_CONFIG);
    setBusy(false);
    if (valid) {
      grantEditorSession();
      onSuccess();
    } else setError('密码不正确，请重试');
  }
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="wax-seal">
          <KeyRound />
        </div>
        <p className="eyebrow">ORGANIZER'S TABLE</p>
        <h1 className="display-type">打开行程编排台</h1>
        <p>这是防止误入的简单门槛，不是安全认证。默认演示密码见使用文档。</p>
        <form onSubmit={submit}>
          <label>
            编辑器密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? '正在验证…' : '入席编辑'}
          </button>
        </form>
      </section>
    </main>
  );
}

function EditorWorkspace({ onLogout }: { onLogout: () => void }) {
  const [event, setEvent] = useState<DiningEvent>(createSampleEvent);
  const [saveStatus, setSaveStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [draftReady, setDraftReady] = useState(false);
  const [eventSwitching, setEventSwitching] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<EntityId>();
  const [selectedRouteId, setSelectedRouteId] = useState<EntityId>();
  const [panel, setPanel] = useState<'activity' | 'station' | 'route' | 'expense'>('activity');
  const [preview, setPreview] = useState(false);
  const [draftBoxOpen, setDraftBoxOpen] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraftSummary[]>([]);
  const [draftBoxLoading, setDraftBoxLoading] = useState(false);
  const [draftBoxNotice, setDraftBoxNotice] = useState('');
  const [draggingStationId, setDraggingStationId] = useState<EntityId>();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceCandidate[]>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [areaFocusSignal, setAreaFocusSignal] = useState<string>();
  const [participantHistory, setParticipantHistory] = useState(loadParticipantHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyInitial, setHistoryInitial] = useState('ALL');
  const [historyNotice, setHistoryNotice] = useState('');
  const importedRef = useRef<HTMLInputElement>(null);
  const draftLoadedRef = useRef(false);
  const areaRequestRef = useRef(0);
  const newParticipantIdsRef = useRef(new Set<EntityId>());
  const eventRef = useRef(event);
  eventRef.current = event;

  const availableHistoryInitials = useMemo(
    () =>
      [...new Set(participantHistory.map((entry) => participantHistoryInitial(entry.name)))].sort(
        (left, right) => (left === '#' ? 1 : right === '#' ? -1 : left.localeCompare(right)),
      ),
    [participantHistory],
  );
  const visibleHistory = useMemo(
    () =>
      historyInitial === 'ALL'
        ? participantHistory
        : participantHistory.filter(
            (entry) => participantHistoryInitial(entry.name) === historyInitial,
          ),
    [historyInitial, participantHistory],
  );
  const currentParticipantKeys = useMemo(
    () => new Set(event.participants.map(participantHistoryKey)),
    [event.participants],
  );

  useEffect(() => {
    loadDraft()
      .then((draft) => {
        const restoredEvent = draft
          ? { ...draft, routes: reconcileRoutes(draft) }
          : eventRef.current;
        if (draft) {
          newParticipantIdsRef.current.clear();
          setEvent(restoredEvent);
        }
        rememberParticipantsInHistory(restoredEvent.participants);
        setSaveStatus('saved');
      })
      .catch(() => setSaveStatus('error'))
      .finally(() => {
        draftLoadedRef.current = true;
        setDraftReady(true);
      });
  }, []);
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    autosave(event, setSaveStatus);
  }, [event]);
  useEffect(() => {
    if (!preview && !draftBoxOpen) return;
    const closeOverlay = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== 'Escape') return;
      if (preview) setPreview(false);
      else setDraftBoxOpen(false);
    };
    window.addEventListener('keydown', closeOverlay);
    return () => window.removeEventListener('keydown', closeOverlay);
  }, [draftBoxOpen, preview]);
  const staleRouteSignature = event.routes
    .filter((route) => route.status === 'stale')
    .map((route) => route.identityKey)
    .join('|');
  useEffect(() => {
    if (!draftLoadedRef.current || !staleRouteSignature) return;
    const calculationEvent = eventRef.current;
    let cancelled = false;
    recalculateStaleRoutes(calculationEvent, mapService).then((calculatedRoutes) => {
      if (cancelled) return;
      const results = new Map(calculatedRoutes.map((route) => [route.id, route]));
      setEvent((current) => {
        let changed = false;
        const routes = current.routes.map((route) => {
          const result = results.get(route.id);
          if (!result || route.status !== 'stale' || route.identityKey !== result.identityKey)
            return route;
          changed = true;
          return result;
        });
        return changed ? { ...current, routes, updatedAt: new Date().toISOString() } : current;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [staleRouteSignature]);
  const issues = useMemo(() => validateEvent(event), [event]);
  const bulkSchedule = useMemo(() => fillSortableUnscheduledStations(event), [event]);
  const selectedStation = event.stations.find((station) => station.id === selectedStationId);
  const selectedRoute = event.routes.find((route) => route.id === selectedRouteId);

  if (!draftReady || eventSwitching) {
    return (
      <main className="editor-loading-shell" aria-busy="true">
        <section>
          <Archive />
          <p className="eyebrow">LOCAL DRAFT ARCHIVE</p>
          <h1 className="display-type">{draftReady ? '正在切换活动' : '正在打开草稿'}</h1>
          <p>
            {draftReady
              ? '先保存当前内容，再安全打开另一份活动。'
              : '先确认浏览器里最近保存的活动，再进入编排台。'}
          </p>
        </section>
      </main>
    );
  }

  function commit(next: DiningEvent) {
    setEvent({ ...next, routes: reconcileRoutes(next), updatedAt: new Date().toISOString() });
  }
  function selectStation(id: EntityId) {
    setSelectedStationId(id);
    setSelectedRouteId(undefined);
    setPanel('station');
  }
  function selectRoute(id: EntityId) {
    setSelectedRouteId(id);
    setSelectedStationId(undefined);
    setPanel('route');
  }
  function addStation(station: Station) {
    setEvent((current) => ({
      ...current,
      stations: [...current.stations, station],
      unscheduledStationIds: [...current.unscheduledStationIds, station.id],
    }));
    selectStation(station.id);
  }
  function moveStation(id: EntityId, delta: number) {
    const index = event.itinerary.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= event.itinerary.length) return;
    const itinerary = [...event.itinerary];
    [itinerary[index], itinerary[target]] = [itinerary[target], itinerary[index]];
    commit({ ...event, itinerary });
  }
  function scheduleStation(id: EntityId) {
    commit({
      ...event,
      itinerary: [...event.itinerary, id],
      unscheduledStationIds: event.unscheduledStationIds.filter((item) => item !== id),
    });
  }
  function scheduleSortableStations() {
    if (bulkSchedule.insertedStationIds.length === 0) return;
    commit({
      ...event,
      itinerary: bulkSchedule.itinerary,
      unscheduledStationIds: bulkSchedule.unscheduledStationIds,
    });
  }
  function dropStationAt(id: EntityId, targetIndex: number) {
    const without = event.itinerary.filter((item) => item !== id);
    const next = [...without.slice(0, targetIndex), id, ...without.slice(targetIndex)];
    commit({
      ...event,
      itinerary: next,
      unscheduledStationIds: event.unscheduledStationIds.filter((item) => item !== id),
    });
    setDraggingStationId(undefined);
  }
  function removeStation(id: EntityId) {
    const next = {
      ...event,
      stations: event.stations.filter((item) => item.id !== id),
      itinerary: event.itinerary.filter((item) => item !== id),
      unscheduledStationIds: event.unscheduledStationIds.filter((item) => item !== id),
      routes: event.routes.filter((item) => item.fromStationId !== id && item.toStationId !== id),
      expenses: event.expenses.filter(
        (item) => item.scope.kind !== 'station' || item.scope.stationId !== id,
      ),
    };
    commit(next);
    if (selectedStationId === id) {
      setSelectedStationId(undefined);
      setPanel('activity');
    }
  }
  function deleteParticipant(participant: Participant) {
    const hasReferences =
      event.stations.some((station) => station.participantIds.includes(participant.id)) ||
      event.expenses.some(
        (expense) =>
          expense.allocation.includedParticipantIds.includes(participant.id) ||
          expense.payments.some((payment) => payment.participantId === participant.id),
      );
    if (
      hasReferences &&
      !window.confirm(
        `删除“${participant.name || '未命名'}”？相关站点参与记录、分摊和垫付也会移除。`,
      )
    )
      return;
    rememberParticipantsInHistory([participant]);
    newParticipantIdsRef.current.delete(participant.id);
    commit(removeParticipant(event, participant.id));
  }
  function rememberParticipantsInHistory(participants: Array<Pick<Participant, 'name' | 'note'>>) {
    setParticipantHistory((current) => {
      const next = mergeParticipantHistory(current, participants);
      saveParticipantHistory(next);
      return next;
    });
  }
  function addNewParticipant() {
    const participant = emptyParticipant();
    newParticipantIdsRef.current.add(participant.id);
    setEvent((current) => ({
      ...current,
      participants: [...current.participants, participant],
    }));
    setHistoryOpen(false);
    setHistoryNotice('已新建参与人，请填写姓名');
  }
  function addHistoricalParticipant(entry: ParticipantHistoryEntry) {
    const entryKey = participantHistoryKey(entry);
    if (currentParticipantKeys.has(entryKey)) return;
    const participant = createParticipantFromHistory(entry);
    setEvent((current) =>
      current.participants.some((person) => participantHistoryKey(person) === entryKey)
        ? current
        : { ...current, participants: [...current.participants, participant] },
    );
    rememberParticipantsInHistory([participant]);
    setHistoryNotice(`已添加 ${entry.name}`);
  }

  async function searchPlaces() {
    if (!searchQuery.trim()) return;
    setSearchMessage('正在搜索…');
    try {
      const results = await mapService.searchPlaces(searchQuery, event.city);
      setSearchResults(results);
      setSearchMessage(results.length ? '' : '没有找到地点，可在地图上右键选点');
    } catch (error) {
      setSearchResults([]);
      setSearchMessage(error instanceof Error ? error.message : '搜索失败，请手动选点');
    }
  }
  async function pickMapCoordinate(target: MapPickTarget) {
    const mapCoordinate = target.coordinate;
    setSearchMessage('正在识别地图位置…');
    try {
      const candidate = await resolveMapPickTarget(mapService, target);
      addStation(stationFromCandidate(candidate));
      setSearchMessage(`已选择：${candidate.name}`);
    } catch (error) {
      addStation(stationFromCandidate({}, mapCoordinate));
      setSearchMessage(
        error instanceof Error ? error.message : '位置已保留，请在右侧填写地点名称和详细地址',
      );
    }
  }
  function parseLink() {
    const result = parseMapShareLink(searchQuery);
    if (result.candidate?.coordinate) {
      const station = stationFromCandidate(result.candidate);
      station.sourceUrl = result.sourceUrl;
      addStation(station);
      setSearchMessage('已从链接提取地点');
    } else setSearchMessage('这个链接无法自动解析，请搜索店名或在地图上右键选点');
  }
  async function importFile(file: File) {
    const current = event;
    setEventSwitching(true);
    try {
      validateEventFileSize(file);
      const parsed = importEventJson(await file.text());
      rememberParticipantsInHistory([...event.participants, ...parsed.participants]);
      newParticipantIdsRef.current.clear();
      setEvent({ ...parsed, routes: reconcileRoutes(parsed) });
      setSearchMessage('活动数据导入成功');
    } catch (error) {
      setEvent(current);
      setSearchMessage(error instanceof Error ? `导入失败：${error.message}` : '导入失败');
    } finally {
      setEventSwitching(false);
    }
  }
  function exportJson() {
    const errors = issues.filter((issue) => issue.severity === 'error');
    if (errors.length) {
      setSearchMessage(`还有 ${errors.length} 项阻断错误，请先处理`);
      return;
    }
    downloadText('event.json', exportEventJson(event), 'application/json;charset=utf-8');
  }
  function exportCsv() {
    downloadText(
      `${event.title || '聚餐'}-结算.csv`,
      exportSettlementCsv(event),
      'text/csv;charset=utf-8',
    );
  }
  async function openDraftBox() {
    setDraftBoxOpen(true);
    setDraftBoxLoading(true);
    setDraftBoxNotice('');
    try {
      setSaveStatus('saving');
      await saveDraft(event);
      setSaveStatus('saved');
      setSavedDrafts(await listSavedDrafts());
    } catch {
      setSaveStatus('error');
      setDraftBoxNotice('草稿箱暂时无法读取，当前编辑内容仍保留在页面中');
    } finally {
      setDraftBoxLoading(false);
    }
  }
  async function restoreSavedEvent(draft: SavedDraftSummary) {
    if (draft.id === event.id) return;
    if (!window.confirm(`恢复“${draft.title}”？当前活动会先保存到草稿箱。`)) return;
    setDraftBoxLoading(true);
    setEventSwitching(true);
    setDraftBoxNotice('');
    try {
      await saveDraft(event);
      const restored = await loadSavedDraft(draft.id);
      if (!restored) {
        setDraftBoxNotice('这个草稿已不存在或数据损坏，请刷新草稿箱');
        setSavedDrafts(await listSavedDrafts());
        return;
      }
      rememberParticipantsInHistory([...event.participants, ...restored.participants]);
      newParticipantIdsRef.current.clear();
      setEvent({ ...restored, routes: reconcileRoutes(restored) });
      setSelectedStationId(undefined);
      setSelectedRouteId(undefined);
      setPanel('activity');
      setDraftBoxOpen(false);
      setSearchMessage(`已从草稿箱恢复“${draft.title}”`);
    } catch {
      setDraftBoxNotice('恢复失败，当前活动没有被替换');
    } finally {
      setDraftBoxLoading(false);
      setEventSwitching(false);
    }
  }
  async function removeSavedEvent(draft: SavedDraftSummary) {
    if (draft.id === event.id) return;
    if (!window.confirm(`从草稿箱删除“${draft.title}”？此操作不会影响其他活动。`)) return;
    setDraftBoxLoading(true);
    setDraftBoxNotice('');
    try {
      await deleteSavedDraft(draft.id);
      setSavedDrafts(await listSavedDrafts());
      setDraftBoxNotice(`已删除“${draft.title}”`);
    } catch (error) {
      setDraftBoxNotice(error instanceof Error ? error.message : '删除草稿失败');
    } finally {
      setDraftBoxLoading(false);
    }
  }
  async function startNewEvent() {
    if (!window.confirm('新建聚餐安排？当前活动会保留为可恢复的上一个活动。')) return;
    setEventSwitching(true);
    try {
      await savePreviousEvent(event);
      rememberParticipantsInHistory(event.participants);
      newParticipantIdsRef.current.clear();
      setEvent(createBlankEvent());
      setSelectedStationId(undefined);
      setSelectedRouteId(undefined);
      setPanel('activity');
      setSearchQuery('');
      setSearchResults([]);
      setSearchMessage('已新建空白聚餐；需要时可从草稿箱恢复其他活动');
    } catch {
      setSearchMessage('当前活动保存失败，未新建聚餐');
    } finally {
      setEventSwitching(false);
    }
  }
  async function restorePreviousEvent() {
    setEventSwitching(true);
    try {
      const previous = await loadPreviousEvent();
      if (!previous) {
        setSearchMessage('暂时没有可恢复的上个活动');
        return;
      }
      if (!window.confirm(`恢复“${previous.title || '未命名聚餐'}”？当前内容将成为新的本地快照。`))
        return;
      await savePreviousEvent(event);
      rememberParticipantsInHistory([...event.participants, ...previous.participants]);
      newParticipantIdsRef.current.clear();
      setEvent({ ...previous, routes: reconcileRoutes(previous) });
      setSelectedStationId(undefined);
      setSelectedRouteId(undefined);
      setPanel('activity');
      setSearchMessage('已恢复上个活动');
    } catch {
      setSearchMessage('当前活动保存失败，未恢复上个活动');
    } finally {
      setEventSwitching(false);
    }
  }

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p className="eyebrow">DINING ROUTE STUDIO</p>
          <h1 className="display-type">聚餐地图 · 行程编排台</h1>
        </div>
        <div className="header-actions">
          <span className={`save-state ${saveStatus}`} role="status" aria-live="polite">
            <Save size={15} />
            {saveStatus === 'saving'
              ? '保存中'
              : saveStatus === 'error'
                ? '保存失败'
                : '草稿已保存'}
          </span>
          <input
            ref={importedRef}
            hidden
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) importFile(file);
            }}
          />
          <button className="new-event-button" onClick={startNewEvent}>
            <Plus />
            新建聚餐
          </button>
          <button onClick={openDraftBox}>
            <Archive />
            草稿箱
          </button>
          <button onClick={() => importedRef.current?.click()}>
            <FileUp />
            导入
          </button>
          <button onClick={() => setPreview(true)}>
            <Eye />
            预览
          </button>
          <button onClick={exportJson}>
            <Download />
            JSON
          </button>
          <button onClick={exportCsv}>
            <Download />
            CSV
          </button>
          <button className="icon-button" aria-label="退出编辑器" onClick={onLogout}>
            <LogOut />
          </button>
        </div>
      </header>
      <section className="editor-grid">
        <aside className="resource-panel">
          <nav className="resource-tabs">
            <button
              className={panel === 'activity' ? 'active' : ''}
              aria-current={panel === 'activity' ? 'page' : undefined}
              onClick={() => setPanel('activity')}
            >
              <MapPin />
              活动
            </button>
            <button
              className={panel === 'expense' ? 'active' : ''}
              aria-current={panel === 'expense' ? 'page' : undefined}
              onClick={() => setPanel('expense')}
            >
              <Wallet />
              费用
            </button>
          </nav>
          <section className="place-search">
            <div className="search-row">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索店名、地址或粘贴地图链接"
                onKeyDown={(e) => e.key === 'Enter' && searchPlaces()}
              />
              <button aria-label="搜索" onClick={searchPlaces}>
                <Search />
              </button>
            </div>
            <div className="search-tools">
              <button onClick={parseLink}>识别地图链接</button>
              <span>悬停地名后右键精确选点</span>
            </div>
            {searchMessage && (
              <p className="helper-message" role="status" aria-live="polite">
                {searchMessage}
              </p>
            )}
            {searchResults.map((place) => (
              <button
                className="search-result"
                key={`${place.poiId}-${place.name}`}
                onClick={() => addStation(stationFromCandidate(place))}
              >
                <strong>{place.name}</strong>
                <span>{place.address}</span>
              </button>
            ))}
          </section>
          <section className="resource-section">
            <div className="section-heading">
              <h2>
                <Users />
                参与人
              </h2>
              <button
                aria-label="添加参与人"
                aria-expanded={historyOpen}
                aria-controls="participant-history-picker"
                className={historyOpen ? 'active' : ''}
                onClick={() => {
                  setHistoryOpen((open) => !open);
                  setHistoryNotice('');
                }}
              >
                <Plus />
              </button>
            </div>
            {historyOpen && (
              <div
                className="participant-history-picker"
                id="participant-history-picker"
                role="region"
                aria-labelledby="participant-history-title"
              >
                <div className="history-picker-title">
                  <span>
                    <History />
                    <strong id="participant-history-title">历史参与人</strong>
                  </span>
                  <small>保存在此浏览器</small>
                </div>
                {participantHistory.length ? (
                  <>
                    <div className="history-initials" aria-label="按姓名首字母筛选">
                      <button
                        className={historyInitial === 'ALL' ? 'active' : ''}
                        aria-pressed={historyInitial === 'ALL'}
                        onClick={() => setHistoryInitial('ALL')}
                      >
                        全部
                      </button>
                      {availableHistoryInitials.map((initial) => (
                        <button
                          key={initial}
                          className={historyInitial === initial ? 'active' : ''}
                          aria-pressed={historyInitial === initial}
                          aria-label={`查看 ${initial} 开头的参与人`}
                          onClick={() => setHistoryInitial(initial)}
                        >
                          {initial}
                        </button>
                      ))}
                    </div>
                    <div className="history-people">
                      {visibleHistory.map((entry, index) => {
                        const key = participantHistoryKey(entry);
                        const added = currentParticipantKeys.has(key);
                        const initial = participantHistoryInitial(entry.name);
                        const previousInitial =
                          index > 0
                            ? participantHistoryInitial(visibleHistory[index - 1].name)
                            : '';
                        return (
                          <div className="history-person-group" key={key}>
                            {historyInitial === 'ALL' && initial !== previousInitial && (
                              <b className="history-letter" aria-hidden="true">
                                {initial}
                              </b>
                            )}
                            <button
                              className="history-person"
                              disabled={added}
                              aria-label={`${added ? '已添加' : '添加历史参与人'} ${entry.name}${entry.note ? `，${entry.note}` : ''}`}
                              onClick={() => addHistoricalParticipant(entry)}
                            >
                              <span>
                                <strong>{entry.name}</strong>
                                {entry.note && <small>{entry.note}</small>}
                              </span>
                              <em>{added ? '已添加' : '添加'}</em>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="history-empty">还没有历史记录，先新建一位参与人吧。</p>
                )}
                <button className="history-create-button" onClick={addNewParticipant}>
                  <UserPlus />
                  新建参与人
                </button>
              </div>
            )}
            {historyNotice && (
              <span className="sr-only" role="status" aria-live="polite">
                {historyNotice}
              </span>
            )}
            {event.participants.map((participant) => (
              <div className="person-row" key={participant.id}>
                <input
                  value={participant.name}
                  aria-label={`参与人姓名：${participant.name || '未命名'}`}
                  onFocus={() => {
                    if (!newParticipantIdsRef.current.delete(participant.id)) return;
                    setEvent((current) => ({
                      ...current,
                      participants: updateById(current.participants, participant.id, { name: '' }),
                    }));
                  }}
                  onChange={(e) =>
                    setEvent({
                      ...event,
                      participants: updateById(event.participants, participant.id, {
                        name: e.target.value,
                      }),
                    })
                  }
                  onBlur={() => rememberParticipantsInHistory([participant])}
                />
                <input
                  value={participant.note ?? ''}
                  aria-label={`参与人备注：${participant.name || '未命名'}`}
                  placeholder="备注"
                  onChange={(e) =>
                    setEvent({
                      ...event,
                      participants: updateById(event.participants, participant.id, {
                        note: e.target.value,
                      }),
                    })
                  }
                  onBlur={() => rememberParticipantsInHistory([participant])}
                />
                <button
                  aria-label={`删除参与人 ${participant.name || '未命名'}`}
                  onClick={() => deleteParticipant(participant)}
                >
                  <X />
                </button>
              </div>
            ))}
          </section>
          <section className="resource-section unscheduled">
            <div className="section-heading">
              <h2>待安排行程</h2>
              <div className="unscheduled-heading-actions">
                <span>{event.unscheduledStationIds.length}</span>
                <button
                  className="bulk-schedule-button"
                  disabled={bulkSchedule.insertedStationIds.length === 0}
                  onClick={scheduleSortableStations}
                  title={
                    bulkSchedule.insertedStationIds.length
                      ? '将已有时间的待安排地点按时间排序后追加到今日行程'
                      : '填写精确时间或模糊时段后即可一键填入'
                  }
                >
                  <ArrowDown />
                  一键填入
                  {bulkSchedule.insertedStationIds.length > 0 && (
                    <b>{bulkSchedule.insertedStationIds.length}</b>
                  )}
                </button>
              </div>
            </div>
            {event.unscheduledStationIds.map((id) => {
              const station = event.stations.find((item) => item.id === id);
              return (
                station && (
                  <div className="unscheduled-card" key={id}>
                    <button className="unscheduled-main" onClick={() => selectStation(id)}>
                      <span>{station.shortName}</span>
                      <em>{formatStationTime(station.start)}</em>
                    </button>
                    <button className="schedule-one-button" onClick={() => scheduleStation(id)}>
                      插入末尾
                    </button>
                    <button
                      className="delete-unscheduled-button"
                      aria-label={`删除待安排地点 ${station.shortName}`}
                      title="删除这个待安排地点"
                      onClick={() => removeStation(id)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                )
              );
            })}
          </section>
        </aside>
        <section className="editor-map">
          <MapCanvas
            event={event}
            selectedStationId={selectedStationId}
            selectedRouteId={selectedRouteId}
            interactivePick
            onSelectStation={selectStation}
            onSelectRoute={selectRoute}
            onPickCoordinate={pickMapCoordinate}
            areaFocusSignal={areaFocusSignal}
          />
          <div className="map-editor-badge">
            <Route size={16} />
            真实路线在编辑时计算并冻结
          </div>
        </section>
        <aside className="inspector-panel">
          {panel === 'activity' && (
            <ActivityInspector
              event={event}
              issues={issues}
              onChange={setEvent}
              onAutoSort={() => {
                const sorted = autoSortStations(event.stations);
                commit({
                  ...event,
                  itinerary: sorted.itinerary,
                  unscheduledStationIds: sorted.unscheduled,
                });
              }}
              onClear={async () => {
                if (
                  !window.confirm(
                    '清空整个草稿箱并恢复示例？所有本地活动草稿都会删除，此操作无法撤销。',
                  )
                )
                  return;
                setEventSwitching(true);
                try {
                  rememberParticipantsInHistory(event.participants);
                  await clearDraft();
                  newParticipantIdsRef.current.clear();
                  setEvent(createSampleEvent());
                  setSearchMessage('已清空整个草稿箱并恢复示例活动');
                } catch {
                  setSearchMessage('草稿箱清空失败，当前活动没有被替换');
                } finally {
                  setEventSwitching(false);
                }
              }}
              onRestorePrevious={restorePreviousEvent}
              onResolveAreaCenter={async (nextArea) => {
                const requestId = ++areaRequestRef.current;
                setAreaFocusSignal(`area-request-${requestId}`);
                setSearchMessage('正在定位所选地区…');
                const offlineCenter = resolveOfflineAreaCenter(nextArea);
                if (offlineCenter) {
                  setEvent((current) => ({
                    ...current,
                    city: nextArea.city,
                    area: { ...nextArea, center: offlineCenter },
                  }));
                  setAreaFocusSignal(`area-offline-${requestId}`);
                  setSearchMessage(`地图已大概定位到${nextArea.district || nextArea.city}`);
                  return;
                }
                try {
                  const areaSearch = areaSearchRequest(nextArea);
                  const center = await mapService.resolveAreaCenter(
                    areaSearch.keyword,
                    areaSearch.level,
                    areaSearch.fallbackAddress,
                  );
                  if (requestId !== areaRequestRef.current) return;
                  setEvent((current) => ({
                    ...current,
                    city: nextArea.city,
                    area: { ...nextArea, center: { ...center, system: 'GCJ02' } },
                  }));
                  setAreaFocusSignal(`area-resolved-${requestId}`);
                  setSearchMessage(`地图已大概定位到${nextArea.district || nextArea.city}`);
                } catch (error) {
                  if (requestId !== areaRequestRef.current) return;
                  setEvent((current) => ({ ...current, city: nextArea.city, area: nextArea }));
                  setSearchMessage(error instanceof Error ? error.message : '地区定位失败');
                }
              }}
            />
          )}
          {panel === 'station' && selectedStation && (
            <StationInspector
              station={selectedStation}
              participants={event.participants}
              onChange={(update) =>
                commit({
                  ...event,
                  stations: updateById(event.stations, selectedStation.id, update),
                })
              }
              onRemove={() => removeStation(selectedStation.id)}
            />
          )}
          {panel === 'route' && selectedRoute && (
            <RouteInspector
              route={selectedRoute}
              event={event}
              onChange={(update) =>
                setEvent({ ...event, routes: updateById(event.routes, selectedRoute.id, update) })
              }
              onRecalculate={async () => {
                const result = await recalculateRoute(event, selectedRoute.id, mapService);
                setEvent({ ...event, routes: updateById(event.routes, selectedRoute.id, result) });
              }}
            />
          )}
          {panel === 'expense' && <ExpenseInspector event={event} onChange={setEvent} />}
        </aside>
      </section>
      <footer className="itinerary-tray">
        <div className="tray-heading">
          <span>今日行程</span>
          <small>拖动站点插入任意位置；箭头也可微调</small>
        </div>
        <div className="itinerary-flow">
          {event.itinerary.map((id, index) => {
            const station = event.stations.find((item) => item.id === id);
            const route =
              index < event.itinerary.length - 1
                ? event.routes.find(
                    (item) =>
                      item.fromStationId === id && item.toStationId === event.itinerary[index + 1],
                  )
                : undefined;
            if (!station) return null;
            return (
              <div
                className="flow-pair"
                key={id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => draggingStationId && dropStationAt(draggingStationId, index)}
              >
                <button
                  draggable
                  className={`flow-station ${selectedStationId === id ? 'selected' : ''}`}
                  aria-label={`第${index + 1}站 ${station.shortName}。按 Alt 加上下方向键调整顺序`}
                  title="可拖动；键盘使用 Alt + ↑/↓ 调整顺序"
                  onDragStart={() => setDraggingStationId(id)}
                  onDragEnd={() => setDraggingStationId(undefined)}
                  onClick={() => selectStation(id)}
                  onKeyDown={(keyboardEvent) => {
                    if (!keyboardEvent.altKey) return;
                    if (keyboardEvent.key === 'ArrowUp') {
                      keyboardEvent.preventDefault();
                      moveStation(id, -1);
                    }
                    if (keyboardEvent.key === 'ArrowDown') {
                      keyboardEvent.preventDefault();
                      moveStation(id, 1);
                    }
                  }}
                >
                  <b>{index + 1}</b>
                  <span>{formatStationTime(station.start)}</span>
                  <strong>{station.shortName}</strong>
                  <i aria-hidden="true">
                    <ArrowUp
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStation(id, -1);
                      }}
                    />
                    <ArrowDown
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStation(id, 1);
                      }}
                    />
                  </i>
                </button>
                {route && (
                  <button
                    className={`flow-route ${selectedRouteId === route.id ? 'selected' : ''}`}
                    onClick={() => selectRoute(route.id)}
                  >
                    <span>{modeNames[route.mode]}</span>
                    <small>
                      {route.durationMinutes
                        ? `${route.durationMinutes} 分`
                        : route.status === 'stale'
                          ? '计算中'
                          : route.mode === 'custom'
                            ? '自定义'
                            : '算路失败'}
                    </small>
                  </button>
                )}
              </div>
            );
          })}
          <div
            className="flow-drop-end"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() =>
              draggingStationId && dropStationAt(draggingStationId, event.itinerary.length)
            }
          >
            拖到末尾
          </div>
        </div>
      </footer>
      {draftBoxOpen && (
        <DraftBoxModal
          drafts={savedDrafts}
          currentEventId={event.id}
          loading={draftBoxLoading}
          notice={draftBoxNotice}
          onClose={() => setDraftBoxOpen(false)}
          onRestore={restoreSavedEvent}
          onDelete={removeSavedEvent}
        />
      )}
      {preview && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
          onMouseDown={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget) setPreview(false);
          }}
        >
          <section className="preview-modal">
            <header>
              <div>
                <p className="eyebrow">MOBILE PREVIEW</p>
                <h2 id="preview-title">参与者看到的地图</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭预览"
                autoFocus
                onClick={() => setPreview(false)}
              >
                <X />
              </button>
            </header>
            <div className="phone-frame">
              <MapCanvas event={event} onSelectStation={setSelectedStationId} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function DraftBoxModal({
  drafts,
  currentEventId,
  loading,
  notice,
  onClose,
  onRestore,
  onDelete,
}: {
  drafts: SavedDraftSummary[];
  currentEventId: string;
  loading: boolean;
  notice: string;
  onClose: () => void;
  onRestore: (draft: SavedDraftSummary) => void;
  onDelete: (draft: SavedDraftSummary) => void;
}) {
  const savedTime = new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-box-title"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <section className="draft-box-modal">
        <header>
          <div>
            <p className="eyebrow">LOCAL DRAFT ARCHIVE</p>
            <h2 className="display-type" id="draft-box-title">
              草稿箱
            </h2>
            <p>每个活动保留最新一次自动保存，仅存放在这个浏览器。</p>
          </div>
          <button className="icon-button" aria-label="关闭草稿箱" autoFocus onClick={onClose}>
            <X />
          </button>
        </header>
        {notice && (
          <p className="draft-box-notice" role="status" aria-live="polite">
            {notice}
          </p>
        )}
        {loading && !drafts.length ? (
          <p className="draft-box-empty">正在整理本地草稿…</p>
        ) : drafts.length ? (
          <div className="draft-card-list" aria-busy={loading}>
            {drafts.map((draft) => {
              const current = draft.id === currentEventId;
              return (
                <article className={`draft-card ${current ? 'current' : ''}`} key={draft.id}>
                  <div className="draft-card-main">
                    <span className="draft-card-mark" aria-hidden="true">
                      <Archive />
                    </span>
                    <div>
                      <div className="draft-card-title">
                        <h3>{draft.title}</h3>
                        {current && <b>正在编辑</b>}
                      </div>
                      <p>
                        {draft.date || '日期待定'} · {draft.area}
                      </p>
                      <small>
                        {draft.stationCount} 个地点 · {draft.participantCount} 位参与人 ·{' '}
                        {draft.savedAt ? savedTime.format(draft.savedAt) : '旧版记录'}
                      </small>
                    </div>
                  </div>
                  <div className="draft-card-actions">
                    <button
                      className="secondary-button"
                      disabled={current || loading}
                      onClick={() => onRestore(draft)}
                    >
                      <RefreshCw />
                      {current ? '当前草稿' : '恢复'}
                    </button>
                    <button
                      className="draft-delete-button"
                      aria-label={`删除草稿 ${draft.title}`}
                      disabled={current || loading}
                      title={current ? '请先切换或新建其他活动' : '删除这个草稿'}
                      onClick={() => onDelete(draft)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="draft-box-empty">还没有可选择的活动草稿。</p>
        )}
      </section>
    </div>
  );
}

function ActivityInspector({
  event,
  issues,
  onChange,
  onAutoSort,
  onClear,
  onRestorePrevious,
  onResolveAreaCenter,
}: {
  event: DiningEvent;
  issues: ReturnType<typeof validateEvent>;
  onChange: (event: DiningEvent) => void;
  onAutoSort: () => void;
  onClear: () => void;
  onRestorePrevious: () => void;
  onResolveAreaCenter: (area: NonNullable<DiningEvent['area']>) => void;
}) {
  const settlementComplete = calculateSettlement(event).complete;
  return (
    <div className="inspector-content">
      <p className="eyebrow">ACTIVITY</p>
      <h2 className="display-type">活动与发布</h2>
      <Field label="活动名称">
        <input
          value={event.title}
          onChange={(e) => onChange({ ...event, title: e.target.value })}
        />
      </Field>
      <div className="field-grid">
        <Field label="日期">
          <input
            type="date"
            value={event.date ?? ''}
            onChange={(e) => onChange({ ...event, date: e.target.value || undefined })}
          />
        </Field>
      </div>
      <AreaFields event={event} onChange={onChange} onResolveCenter={onResolveAreaCenter} />
      <Field label="一句简介">
        <textarea
          rows={3}
          value={event.intro ?? ''}
          onChange={(e) => onChange({ ...event, intro: e.target.value })}
        />
      </Field>
      <Field label="结算状态">
        <select
          value={event.settlementStatus}
          onChange={(e) =>
            onChange({
              ...event,
              settlementStatus: e.target.value as DiningEvent['settlementStatus'],
            })
          }
        >
          <option value="not_started">未开始</option>
          <option value="organizing">整理中</option>
          <option value="completed" disabled={!settlementComplete}>
            已完成（账目守恒后可选）
          </option>
        </select>
      </Field>
      <button className="secondary-button" onClick={onAutoSort}>
        按时间重新排序
      </button>
      <div className="validation-box">
        <h3>发布校验</h3>
        {issues.length === 0 ? (
          <p className="all-good">
            <Check />
            数据完整，可以导出
          </p>
        ) : (
          issues.map((issue) => (
            <p className={issue.severity} key={`${issue.code}-${issue.entityId}`}>
              <AlertTriangle />
              {issue.message}
            </p>
          ))
        )}
      </div>
      <PasswordDigestTool />
      <button className="secondary-button restore-event-button" onClick={onRestorePrevious}>
        <RefreshCw />
        恢复上个活动
      </button>
      <button className="danger-link" onClick={onClear}>
        清空整个草稿箱并恢复示例
      </button>
    </div>
  );
}

function AreaFields({
  event,
  onChange,
  onResolveCenter,
}: {
  event: DiningEvent;
  onChange: (event: DiningEvent) => void;
  onResolveCenter: (area: NonNullable<DiningEvent['area']>) => void;
}) {
  const provinceCode = event.area?.provinceCode ?? '';
  const cityCode = event.area?.cityCode ?? '';
  const cityOptions = citiesFor(provinceCode);
  const districtOptions = districtsFor(provinceCode, cityCode);

  function selectProvince(code: string) {
    const firstCity = citiesFor(code)[0];
    const area = firstCity ? buildArea(code, firstCity.value) : undefined;
    onChange({ ...event, city: area?.city, area });
    if (area) onResolveCenter(area);
  }
  function selectCity(code: string) {
    const area = buildArea(provinceCode, code);
    onChange({ ...event, city: area?.city, area });
    if (area) onResolveCenter(area);
  }
  function selectDistrict(code: string) {
    const area = buildArea(provinceCode, cityCode, code || undefined);
    onChange({ ...event, city: area?.city, area });
    if (area) onResolveCenter(area);
  }

  return (
    <fieldset className="area-fields">
      <legend>大概区域</legend>
      <div className="area-grid">
        <Field label="省份">
          <select value={provinceCode} onChange={(e) => selectProvince(e.target.value)}>
            <option value="">请选择省份</option>
            {provinces.map((province) => (
              <option value={province.value} key={province.value}>
                {province.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="城市">
          <select
            value={cityCode}
            disabled={!provinceCode}
            onChange={(e) => selectCity(e.target.value)}
          >
            <option value="">请选择城市</option>
            {cityOptions.map((city) => (
              <option value={city.value} key={city.value}>
                {city.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="区县（可选）">
          <select
            value={event.area?.districtCode ?? ''}
            disabled={!cityCode || !districtOptions.length}
            onChange={(e) => selectDistrict(e.target.value)}
          >
            <option value="">不限区县</option>
            {districtOptions.map((district) => (
              <option value={district.value} key={district.value}>
                {district.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {event.area ? (
        <p>
          <MapPin /> 地图将以 {event.area.province} · {event.area.city}
          {event.area.district ? ` · ${event.area.district}` : ''} 为初始范围
        </p>
      ) : event.city ? (
        <p>旧活动城市：{event.city}。重新选择省市后可启用地图大概定位。</p>
      ) : (
        <p>先选择省市，区县可以稍后再定。</p>
      )}
    </fieldset>
  );
}

function StationInspector({
  station,
  participants,
  onChange,
  onRemove,
}: {
  station: Station;
  participants: Participant[];
  onChange: (update: Partial<Station>) => void;
  onRemove: () => void;
}) {
  const timeKind = station.start.kind;
  const exactStart = station.start.kind === 'exact' ? station.start : undefined;
  function setTimeKind(kind: StationTime['kind']) {
    onChange({
      start:
        kind === 'exact'
          ? { kind, time: '12:00', dayOffset: 0 }
          : kind === 'fuzzy'
            ? { kind, period: '中午' }
            : { kind },
    });
  }
  return (
    <div className="inspector-content">
      <p className="eyebrow">STATION</p>
      <h2 className="display-type">地点详情</h2>
      <div className="field-grid">
        <Field label="地图简称">
          <input
            value={station.shortName}
            onChange={(e) => onChange({ shortName: e.target.value })}
          />
        </Field>
        <Field label="地点全名">
          <input value={station.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
      </div>
      <Field label="详细地址">
        <input value={station.address} onChange={(e) => onChange({ address: e.target.value })} />
      </Field>
      <Field label="开始时间类型">
        <div className="segmented">
          {(['exact', 'fuzzy', 'pending'] as const).map((kind) => (
            <button
              className={timeKind === kind ? 'active' : ''}
              onClick={() => setTimeKind(kind)}
              key={kind}
            >
              {kind === 'exact' ? '精确' : kind === 'fuzzy' ? '时段' : '待定'}
            </button>
          ))}
        </div>
      </Field>
      {exactStart && (
        <div className="field-grid">
          <Field label="时间">
            <input
              type="time"
              value={exactStart.time}
              onChange={(e) =>
                onChange({
                  start: { kind: 'exact', time: e.target.value, dayOffset: exactStart.dayOffset },
                })
              }
            />
          </Field>
          <Field label="第几天">
            <input
              type="number"
              min="1"
              value={exactStart.dayOffset + 1}
              onChange={(e) =>
                onChange({
                  start: {
                    kind: 'exact',
                    time: exactStart.time,
                    dayOffset: Math.max(0, Number(e.target.value) - 1),
                  },
                })
              }
            />
          </Field>
        </div>
      )}
      {station.start.kind === 'fuzzy' && (
        <Field label="模糊时段">
          <select
            value={station.start.period}
            onChange={(e) =>
              onChange({ start: { kind: 'fuzzy', period: e.target.value as FuzzyPeriod } })
            }
          >
            {FUZZY_PERIODS.map((period) => (
              <option key={period}>{period}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="field-grid">
        <Field label="结束时间（可空）">
          <input
            type="time"
            value={station.end?.time ?? ''}
            onChange={(e) =>
              onChange({
                end: e.target.value
                  ? {
                      time: e.target.value,
                      dayOffset: station.end?.dayOffset ?? exactStart?.dayOffset ?? 0,
                    }
                  : undefined,
              })
            }
          />
        </Field>
        <Field label="结束在第几天">
          <input
            type="number"
            min="1"
            disabled={!station.end}
            value={(station.end?.dayOffset ?? 0) + 1}
            onChange={(e) =>
              station.end &&
              onChange({
                end: { ...station.end, dayOffset: Math.max(0, Number(e.target.value) - 1) },
              })
            }
          />
        </Field>
      </div>
      <Field label="本站安排">
        <textarea
          rows={3}
          value={station.activity ?? ''}
          onChange={(e) => onChange({ activity: e.target.value })}
        />
      </Field>
      <Field label="提醒/备注">
        <textarea
          rows={2}
          value={station.reminder ?? ''}
          onChange={(e) => onChange({ reminder: e.target.value })}
        />
      </Field>
      <Field label="本站参与人">
        <div className="check-grid">
          {participants.map((person) => (
            <label key={person.id}>
              <input
                type="checkbox"
                checked={station.participantIds.includes(person.id)}
                onChange={(e) =>
                  onChange({
                    participantIds: e.target.checked
                      ? [...station.participantIds, person.id]
                      : station.participantIds.filter((id) => id !== person.id),
                  })
                }
              />
              <span>
                {person.name}
                {person.note && <small>{person.note}</small>}
              </span>
            </label>
          ))}
        </div>
      </Field>
      <button className="danger-button" onClick={onRemove}>
        <Trash2 />
        删除这次访问
      </button>
    </div>
  );
}

function PasswordDigestTool() {
  const [password, setPassword] = useState('');
  const [result, setResult] = useState('');
  async function generate() {
    const salt = `dining-map-${crypto.randomUUID()}`;
    const digestHex = await derivePasswordDigest(password, salt);
    setResult(JSON.stringify({ salt, iterations: 120000, digestHex }, null, 2));
  }
  return (
    <details className="password-tool">
      <summary>生成新的编辑器密码摘要</summary>
      <p>
        生成后复制到 <code>src/config/editor.ts</code>，静态密码仍仅用于防误入。
      </p>
      <input
        type="password"
        value={password}
        placeholder="输入新密码"
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="secondary-button" disabled={!password} onClick={generate}>
        生成配置片段
      </button>
      {result && <textarea readOnly rows={6} value={result} />}
    </details>
  );
}

function RouteInspector({
  route,
  event,
  onChange,
  onRecalculate,
}: {
  route: RouteSegment;
  event: DiningEvent;
  onChange: (update: Partial<RouteSegment>) => void;
  onRecalculate: () => void;
}) {
  const from = event.stations.find((item) => item.id === route.fromStationId);
  const to = event.stations.find((item) => item.id === route.toStationId);
  function changeMode(mode: TransportMode) {
    if (!from || !to) return;
    onChange({
      mode,
      identityKey: routeIdentity(from, to, mode),
      status: mode === 'custom' ? 'fallback' : 'stale',
      distanceMeters: undefined,
      durationMinutes: undefined,
      calculatedAt: undefined,
      geometry: [
        { lng: from.coordinate.lng, lat: from.coordinate.lat },
        { lng: to.coordinate.lng, lat: to.coordinate.lat },
      ],
    });
  }
  return (
    <div className="inspector-content">
      <p className="eyebrow">ROUTE SEGMENT</p>
      <h2 className="display-type">
        {from?.shortName} → {to?.shortName}
      </h2>
      <Field label="交通方式">
        <select value={route.mode} onChange={(e) => changeMode(e.target.value as TransportMode)}>
          {Object.entries(modeNames).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {route.mode === 'custom' ? (
        <>
          <Field label="交通说明">
            <input
              value={route.manualDescription ?? ''}
              placeholder="例如：朋友接送"
              onChange={(e) => onChange({ manualDescription: e.target.value })}
            />
          </Field>
          <Field label="预计耗时（分钟）">
            <input
              type="number"
              value={route.durationMinutes ?? ''}
              onChange={(e) => onChange({ durationMinutes: Number(e.target.value) || undefined })}
            />
          </Field>
        </>
      ) : (
        <button
          className="primary-button"
          disabled={route.status === 'stale'}
          onClick={onRecalculate}
        >
          <RefreshCw />
          {route.status === 'stale' ? '正在自动计算…' : '重新计算真实路线'}
        </button>
      )}
      <dl className="route-stats">
        <div>
          <dt>状态</dt>
          <dd>
            {route.status === 'ready'
              ? '已冻结'
              : route.status === 'stale'
                ? '正在自动计算'
                : '虚线降级'}
          </dd>
        </div>
        <div>
          <dt>距离</dt>
          <dd>{route.distanceMeters ? `${(route.distanceMeters / 1000).toFixed(1)} km` : '—'}</dd>
        </div>
        <div>
          <dt>耗时</dt>
          <dd>{route.durationMinutes ? `${route.durationMinutes} 分钟` : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

function ExpenseInspector({
  event,
  onChange,
}: {
  event: DiningEvent;
  onChange: (event: DiningEvent) => void;
}) {
  const [selectedId, setSelectedId] = useState<EntityId | undefined>(event.expenses[0]?.id);
  const expense = event.expenses.find((item) => item.id === selectedId);
  function addExpense() {
    const next: Expense = {
      id: createId('expense'),
      name: '新费用',
      scope: { kind: 'global' },
      amountCents: null,
      allocation: {
        mode: 'equal',
        includedParticipantIds: event.participants.map((item) => item.id),
      },
      payments: [],
    };
    onChange({ ...event, expenses: [...event.expenses, next] });
    setSelectedId(next.id);
  }
  function update(update: Partial<Expense>) {
    if (!expense) return;
    onChange({ ...event, expenses: updateById(event.expenses, expense.id, update) });
  }
  const calculation = expense ? calculateExpense(expense) : undefined;
  const settlement = calculateSettlement(event);
  return (
    <div className="inspector-content expense-inspector">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EXPENSES</p>
          <h2 className="display-type">费用与 AA</h2>
        </div>
        <button onClick={addExpense}>
          <Plus />
        </button>
      </div>
      <div className="expense-tabs">
        {event.expenses.map((item) => (
          <button
            className={item.id === selectedId ? 'active' : ''}
            key={item.id}
            onClick={() => setSelectedId(item.id)}
          >
            {item.name}
            <small>{item.amountCents === null ? '待结算' : formatYuan(item.amountCents)}</small>
          </button>
        ))}
      </div>
      {expense && (
        <>
          <Field label="费用名称">
            <input value={expense.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <div className="field-grid">
            <Field label="金额（可活动后补）">
              <input
                inputMode="decimal"
                value={expense.amountCents === null ? '' : (expense.amountCents / 100).toFixed(2)}
                placeholder="待结算"
                onChange={(e) => {
                  try {
                    update({ amountCents: parseYuan(e.target.value) });
                  } catch {
                    /* keep prior value */
                  }
                }}
              />
            </Field>
            <Field label="归属">
              <select
                value={expense.scope.kind === 'global' ? 'global' : expense.scope.stationId}
                onChange={(e) =>
                  update({
                    scope:
                      e.target.value === 'global'
                        ? { kind: 'global' }
                        : { kind: 'station', stationId: e.target.value },
                  })
                }
              >
                <option value="global">全局费用</option>
                {event.stations.map((station) => (
                  <option value={station.id} key={station.id}>
                    {station.shortName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="分摊方式">
            <select
              value={expense.allocation.mode}
              onChange={(e) =>
                update({
                  allocation: {
                    ...expense.allocation,
                    mode: e.target.value as Expense['allocation']['mode'],
                  },
                })
              }
            >
              <option value="equal">均分</option>
              <option value="weighted">按权重</option>
              <option value="custom">自定义金额</option>
              <option value="fixed_then_equal">固定后均分余额</option>
              <option value="fixed_then_weighted">固定后按权重</option>
            </select>
          </Field>
          <Field label="分摊参与人">
            <div className="expense-people">
              {event.participants.map((person) => {
                const included = expense.allocation.includedParticipantIds.includes(person.id);
                const numberValue =
                  expense.allocation.mode === 'weighted' ||
                  expense.allocation.mode === 'fixed_then_weighted'
                    ? (expense.allocation.weights?.[person.id] ?? 1)
                    : expense.allocation.mode === 'custom'
                      ? (expense.allocation.customCents?.[person.id] ?? 0) / 100
                      : expense.allocation.mode === 'fixed_then_equal'
                        ? (expense.allocation.fixedCents?.[person.id] ?? 0) / 100
                        : undefined;
                return (
                  <div key={person.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={(e) =>
                          update({
                            allocation: {
                              ...expense.allocation,
                              includedParticipantIds: e.target.checked
                                ? [...expense.allocation.includedParticipantIds, person.id]
                                : expense.allocation.includedParticipantIds.filter(
                                    (id) => id !== person.id,
                                  ),
                            },
                          })
                        }
                      />
                      {person.name}
                    </label>
                    {numberValue !== undefined && (
                      <input
                        type="number"
                        min="0"
                        step={expense.allocation.mode.includes('weighted') ? '0.5' : '0.01'}
                        value={numberValue}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (expense.allocation.mode.includes('weighted'))
                            update({
                              allocation: {
                                ...expense.allocation,
                                weights: { ...expense.allocation.weights, [person.id]: value },
                              },
                            });
                          else if (expense.allocation.mode === 'custom')
                            update({
                              allocation: {
                                ...expense.allocation,
                                customCents: {
                                  ...expense.allocation.customCents,
                                  [person.id]: Math.round(value * 100),
                                },
                              },
                            });
                          else
                            update({
                              allocation: {
                                ...expense.allocation,
                                fixedCents: {
                                  ...expense.allocation.fixedCents,
                                  [person.id]: Math.round(value * 100),
                                },
                              },
                            });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
          <Field label="多人垫付">
            <div className="payment-list">
              {event.participants.map((person) => {
                const paid =
                  expense.payments.find((item) => item.participantId === person.id)?.amountCents ??
                  0;
                return (
                  <label key={person.id}>
                    <span>{person.name}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={(paid / 100).toFixed(2)}
                      onChange={(e) => {
                        const cents = Math.round(Number(e.target.value) * 100);
                        update({
                          payments: [
                            ...expense.payments.filter((item) => item.participantId !== person.id),
                            ...(cents ? [{ participantId: person.id, amountCents: cents }] : []),
                          ],
                        });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="allocation-status">
            <span>未分配：{formatYuan(calculation?.unallocatedCents ?? 0)}</span>
            <span>未记录垫付：{formatYuan(calculation?.unpaidCents ?? 0)}</span>
          </div>
          <button
            className="danger-link"
            onClick={() => {
              onChange({
                ...event,
                expenses: event.expenses.filter((item) => item.id !== expense.id),
              });
              setSelectedId(undefined);
            }}
          >
            删除该费用
          </button>
        </>
      )}
      <div className="settlement-mini">
        <strong>当前结算</strong>
        <span>{settlement.complete ? '账目已守恒' : '仍在整理中'}</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
