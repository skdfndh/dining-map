import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Compass,
  ListRestart,
  Map as MapIcon,
  Navigation,
  RotateCcw,
  Route,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { DiningEvent, EntityId, RouteSegment, Station, ViewerState } from '../domain/types';
import { parseEvent } from '../domain/schema';
import { createSampleEvent } from '../domain/sample';
import { formatStationTime } from '../domain/time';
import { MapCanvas } from '../components/MapCanvas';
import { amapNavigationUrl, baiduNavigationUrl } from '../maps/navigation';
import { calculateSettlement } from '../settlement/calculate';
import { formatYuan } from '../settlement/money';
import { loadViewerState, saveViewerState } from '../storage/viewer-state';
import { inferCurrentStation } from './progress';

const modeNames: Record<RouteSegment['mode'], string> = {
  walking: '步行',
  cycling: '骑行',
  driving: '驾车',
  taxi: '打车',
  transit: '公共交通',
  custom: '自定义',
};

export function ViewerApp() {
  const [event, setEvent] = useState<DiningEvent>(createSampleEvent);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<ViewerState>({ arrivedStationIds: [], mode: 'overview' });
  const [selectedStationId, setSelectedStationId] = useState<EntityId>();
  const [selectedRouteId, setSelectedRouteId] = useState<EntityId>();
  const [showExpenses, setShowExpenses] = useState(false);
  const [loadNotice, setLoadNotice] = useState('');
  const [focusSignal, setFocusSignal] = useState('overview');

  useEffect(() => {
    fetch('./event.json')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => {
        const parsed = parseEvent(json);
        if (parsed.stations.length) setEvent(parsed);
        else setLoadNotice('当前展示示例活动，编辑器导出的 event.json 替换后即可发布真实行程。');
      })
      .catch(() => setLoadNotice('活动数据暂时无法读取，正在展示内置示例。'))
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    setState(loadViewerState(event.id));
  }, [loaded, event.id]);
  useEffect(() => {
    if (loaded) saveViewerState(event.id, state);
  }, [event.id, loaded, state]);
  const currentStationId = inferCurrentStation(event, state);
  const focusId = state.mode === 'step' ? (state.focusedStationId ?? currentStationId) : undefined;
  const selectedStation = event.stations.find((station) => station.id === selectedStationId);
  const selectedRoute = event.routes.find((route) => route.id === selectedRouteId);
  const currentIndex = Math.max(
    0,
    event.itinerary.indexOf(focusId ?? currentStationId ?? event.itinerary[0]),
  );

  function patchState(patch: Partial<ViewerState>) {
    setState((current) => ({ ...current, ...patch }));
  }
  function selectStation(id: EntityId) {
    setSelectedStationId(id);
    setSelectedRouteId(undefined);
  }
  function selectRoute(id: EntityId) {
    setSelectedRouteId(id);
    setSelectedStationId(undefined);
  }
  function focusAt(index: number) {
    const normalized = Math.max(0, Math.min(event.itinerary.length - 1, index));
    const id = event.itinerary[normalized];
    patchState({ mode: 'step', focusedStationId: id });
    setSelectedStationId(id);
    setFocusSignal(`${id}-${Date.now()}`);
  }
  function markArrived() {
    const id = focusId ?? event.itinerary[currentIndex];
    if (!id) return;
    const arrived = state.arrivedStationIds.includes(id);
    patchState({
      currentStationId: arrived ? undefined : id,
      arrivedStationIds: arrived
        ? state.arrivedStationIds.filter((item) => item !== id)
        : [
            ...state.arrivedStationIds.filter(
              (item) => event.itinerary.indexOf(item) <= currentIndex,
            ),
            id,
          ],
      focusedStationId: id,
    });
  }
  function showOverview() {
    patchState({ mode: 'overview' });
    setSelectedStationId(undefined);
    setSelectedRouteId(undefined);
    setFocusSignal(`overview-${Date.now()}`);
  }

  return (
    <main className="viewer-shell">
      <MapCanvas
        event={event}
        selectedStationId={selectedStationId ?? focusId}
        selectedRouteId={selectedRouteId}
        currentStationId={currentStationId}
        arrivedStationIds={state.arrivedStationIds}
        onSelectStation={selectStation}
        onSelectRoute={selectRoute}
        focusSignal={focusSignal}
      />
      <header className="viewer-title">
        <div>
          <p>
            {event.date
              ? new Date(`${event.date}T00:00:00`).toLocaleDateString('zh-CN', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })
              : '日期待定'}{' '}
            · {event.city || '城市待定'}
          </p>
          <h1 className="display-type">{event.title}</h1>
        </div>
        <button aria-label="查看完整路线" onClick={showOverview}>
          <MapIcon />
        </button>
      </header>
      {loadNotice && (
        <div className="data-notice">
          {loadNotice}
          <button onClick={() => setLoadNotice('')}>
            <X />
          </button>
        </div>
      )}
      <div className="viewer-tools">
        <button onClick={showOverview}>
          <Route />
          <span>全程</span>
        </button>
        <button
          onClick={() => {
            const id = currentStationId ?? event.itinerary[0];
            if (id) {
              patchState({ mode: 'step', focusedStationId: id });
              setFocusSignal(`${id}-${Date.now()}`);
            }
          }}
        >
          <Compass />
          <span>当前站</span>
        </button>
        <button onClick={() => setShowExpenses(true)}>
          <Wallet />
          <span>费用</span>
        </button>
      </div>
      {state.mode === 'step' && event.itinerary.length > 0 && (
        <section className="step-controller">
          <button
            aria-label="上一站"
            disabled={currentIndex === 0}
            onClick={() => focusAt(currentIndex - 1)}
          >
            <ArrowLeft />
          </button>
          <div>
            <span>
              {currentIndex + 1} / {event.itinerary.length}
            </span>
            <strong>
              {
                event.stations.find((station) => station.id === event.itinerary[currentIndex])
                  ?.shortName
              }
            </strong>
          </div>
          <button
            aria-label="下一站"
            disabled={currentIndex >= event.itinerary.length - 1}
            onClick={() => focusAt(currentIndex + 1)}
          >
            <ArrowRight />
          </button>
          <button className="arrive-button" onClick={markArrived}>
            {state.arrivedStationIds.includes(event.itinerary[currentIndex]) ? (
              <>
                <RotateCcw />
                撤销到达
              </>
            ) : (
              <>
                <Check />
                已到达这里
              </>
            )}
          </button>
          <button className="overview-link" onClick={showOverview}>
            <ListRestart />
            查看完整路线
          </button>
        </section>
      )}
      {selectedStation && (
        <StationSheet
          event={event}
          station={selectedStation}
          onClose={() => setSelectedStationId(undefined)}
          onFocus={() => {
            const index = event.itinerary.indexOf(selectedStation.id);
            focusAt(index);
          }}
        />
      )}
      {selectedRoute && (
        <RouteSheet route={selectedRoute} onClose={() => setSelectedRouteId(undefined)} />
      )}
      {showExpenses && (
        <ExpenseSheet
          event={event}
          state={state}
          onState={patchState}
          onClose={() => setShowExpenses(false)}
        />
      )}
    </main>
  );
}

function StationSheet({
  event,
  station,
  onClose,
  onFocus,
}: {
  event: DiningEvent;
  station: Station;
  onClose: () => void;
  onFocus: () => void;
}) {
  const participants = event.participants.filter((person) =>
    station.participantIds.includes(person.id),
  );
  async function copyAddress() {
    await navigator.clipboard?.writeText(`${station.name} ${station.address}`);
  }
  return (
    <section className="bottom-sheet station-sheet">
      <div className="sheet-handle" />
      <header>
        <div>
          <p className="eyebrow">STOP {event.itinerary.indexOf(station.id) + 1}</p>
          <h2 className="display-type">{station.name}</h2>
        </div>
        <button aria-label="关闭详情" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="time-ribbon">
        <span>{formatStationTime(station.start)}</span>
        {station.end && <span>至 {station.end.time}</span>}
      </div>
      <p className="address">
        <Navigation />
        {station.address || '地址待补充'}
        <button aria-label="复制地址" onClick={copyAddress}>
          <Clipboard />
        </button>
      </p>
      {station.activity && <p className="activity-copy">{station.activity}</p>}
      {station.reminder && (
        <div className="reminder-card">
          <strong>组织者提醒</strong>
          <span>{station.reminder}</span>
        </div>
      )}
      <div className="people-chips">
        <Users />
        {participants.map((person) => (
          <span key={person.id}>{person.name}</span>
        ))}
      </div>
      <div className="nav-actions">
        <a href={amapNavigationUrl(station)} target="_blank" rel="noreferrer">
          高德导航
        </a>
        <a href={baiduNavigationUrl(station)} target="_blank" rel="noreferrer">
          百度导航
        </a>
      </div>
      <button className="focus-stop" onClick={onFocus}>
        <Compass />
        进入逐站浏览
      </button>
      <p className="wechat-note">若微信内无法唤起导航，请使用右上角菜单在系统浏览器中打开。</p>
    </section>
  );
}

function RouteSheet({ route, onClose }: { route: RouteSegment; onClose: () => void }) {
  return (
    <section className="bottom-sheet route-sheet">
      <div className="sheet-handle" />
      <header>
        <div>
          <p className="eyebrow">ON THE WAY</p>
          <h2 className="display-type">
            {modeNames[route.mode]} ·{' '}
            {route.durationMinutes ? `${route.durationMinutes} 分钟` : '耗时待定'}
          </h2>
        </div>
        <button aria-label="关闭详情" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="route-summary">
        <div>
          <Route />
          <span>路线状态</span>
          <strong>{route.status === 'ready' ? '已按真实道路冻结' : '直线/自定义降级'}</strong>
        </div>
        <div>
          <MapIcon />
          <span>距离</span>
          <strong>
            {route.distanceMeters ? `${(route.distanceMeters / 1000).toFixed(1)} km` : '待定'}
          </strong>
        </div>
      </div>
      {route.manualDescription && <p>{route.manualDescription}</p>}
    </section>
  );
}

function ExpenseSheet({
  event,
  state,
  onState,
  onClose,
}: {
  event: DiningEvent;
  state: ViewerState;
  onState: (state: Partial<ViewerState>) => void;
  onClose: () => void;
}) {
  const settlement = calculateSettlement(event);
  const people = new globalThis.Map(event.participants.map((person) => [person.id, person]));
  const myTotal = settlement.totals.find((item) => item.participantId === state.participantId);
  const [expanded, setExpanded] = useState<EntityId>();
  const [section, setSection] = useState<'mine' | 'all'>('mine');
  const statusText =
    event.settlementStatus === 'not_started'
      ? '费用将在活动后公布'
      : event.settlementStatus === 'organizing'
        ? '结算整理中，金额可能变化'
        : '结算已完成';
  return (
    <section className="expense-sheet-full">
      <header>
        <div>
          <p className="eyebrow">SETTLEMENT</p>
          <h2 className="display-type">聚餐费用</h2>
        </div>
        <button onClick={onClose}>
          <X />
        </button>
      </header>
      <div className={`settlement-status ${event.settlementStatus}`}>{statusText}</div>
      <label className="who-am-i">
        <span>我是谁</span>
        <select
          value={state.participantId ?? ''}
          onChange={(e) => onState({ participantId: e.target.value || undefined })}
        >
          <option value="">选择姓名快速查看</option>
          {event.participants.map((person) => (
            <option value={person.id} key={person.id}>
              {person.name}
              {person.note ? ` · ${person.note}` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="expense-section-tabs">
        <button className={section === 'mine' ? 'active' : ''} onClick={() => setSection('mine')}>
          我的账单
        </button>
        <button className={section === 'all' ? 'active' : ''} onClick={() => setSection('all')}>
          全部结算
        </button>
      </div>
      {section === 'mine' ? (
        <div className="my-expense">
          {myTotal ? (
            <>
              <div className="money-hero">
                <span>
                  {myTotal.netCents > 0 ? '还需支付' : myTotal.netCents < 0 ? '应收回' : '已经结清'}
                </span>
                <strong>{formatYuan(Math.abs(myTotal.netCents))}</strong>
              </div>
              <div className="money-grid">
                <div>
                  <span>我的消费</span>
                  <b>{formatYuan(myTotal.consumedCents)}</b>
                </div>
                <div>
                  <span>我的垫付</span>
                  <b>{formatYuan(myTotal.paidCents)}</b>
                </div>
              </div>
              <h3>我的转账</h3>
              {settlement.transfers
                .filter(
                  (item) =>
                    item.fromParticipantId === state.participantId ||
                    item.toParticipantId === state.participantId,
                )
                .map((transfer) => (
                  <div
                    className="transfer-row"
                    key={`${transfer.fromParticipantId}-${transfer.toParticipantId}`}
                  >
                    <span>
                      {people.get(transfer.fromParticipantId)?.name} →{' '}
                      {people.get(transfer.toParticipantId)?.name}
                    </span>
                    <strong>{formatYuan(transfer.amountCents)}</strong>
                  </div>
                ))}
            </>
          ) : (
            <div className="empty-person">
              <Users />
              <p>先选择“我是谁”，这里会突出显示你的消费、垫付和转账。</p>
            </div>
          )}
        </div>
      ) : (
        <div className="all-expense">
          <div className="total-list">
            {settlement.totals.map((total) => (
              <div
                className={total.participantId === state.participantId ? 'is-me' : ''}
                key={total.participantId}
              >
                <span>{people.get(total.participantId)?.name}</span>
                <small>
                  消费 {formatYuan(total.consumedCents)} · 垫付 {formatYuan(total.paidCents)}
                </small>
                <strong>
                  {total.netCents > 0
                    ? `应付 ${formatYuan(total.netCents)}`
                    : total.netCents < 0
                      ? `应收 ${formatYuan(-total.netCents)}`
                      : '已平衡'}
                </strong>
              </div>
            ))}
          </div>
          <h3>简化转账方案</h3>
          {settlement.transfers.length ? (
            settlement.transfers.map((transfer) => (
              <div
                className="transfer-row"
                key={`${transfer.fromParticipantId}-${transfer.toParticipantId}`}
              >
                <span>
                  {people.get(transfer.fromParticipantId)?.name} →{' '}
                  {people.get(transfer.toParticipantId)?.name}
                </span>
                <strong>{formatYuan(transfer.amountCents)}</strong>
              </div>
            ))
          ) : (
            <p className="muted-copy">结算完成后生成转账关系。</p>
          )}
        </div>
      )}
      <div className="expense-details">
        <h3>费用明细</h3>
        {event.expenses.map((expense, index) => {
          const calculation = settlement.expenseCalculations[index];
          const stationId = expense.scope.kind === 'station' ? expense.scope.stationId : undefined;
          const scope = stationId
            ? (event.stations.find((station) => station.id === stationId)?.shortName ?? '未知站点')
            : '全局费用';
          return (
            <article key={expense.id}>
              <button onClick={() => setExpanded(expanded === expense.id ? undefined : expense.id)}>
                <span>
                  <b>{expense.name}</b>
                  <small>
                    {scope} ·{' '}
                    {expense.amountCents === null ? '待结算' : formatYuan(expense.amountCents)}
                  </small>
                </span>
                {expanded === expense.id ? <ChevronUp /> : <ChevronDown />}
              </button>
              {expanded === expense.id && (
                <div className="expense-breakdown">
                  <p>方式：{expense.allocation.mode}</p>
                  {Object.entries(calculation.shares).map(([id, cents]) => (
                    <p key={id}>
                      {people.get(id)?.name} 分摊 {formatYuan(cents)}
                    </p>
                  ))}
                  {Object.entries(calculation.paid).map(([id, cents]) => (
                    <p key={`paid-${id}`}>
                      {people.get(id)?.name} 垫付 {formatYuan(cents)}
                    </p>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
