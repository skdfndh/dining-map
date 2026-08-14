import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, MapPinned } from 'lucide-react';
import type { DiningEvent, EntityId, RouteSegment } from '../domain/types';
import { formatStationTimeRange } from '../domain/time';
import { hasAmapConfig, loadAmap, type AMapMap, type AMapOverlay } from '../maps/amap-loader';
import type { MapPickTarget } from '../maps/types';
import { createHotspotTracker } from '../maps/pick';
import { decideMapViewport } from '../maps/viewport';
import { createStationMarkerContent } from './station-marker';
import './map-canvas.css';

interface MapCanvasProps {
  event: DiningEvent;
  selectedStationId?: EntityId;
  selectedRouteId?: EntityId;
  currentStationId?: EntityId;
  arrivedStationIds?: EntityId[];
  interactivePick?: boolean;
  onSelectStation?: (id: EntityId) => void;
  onSelectRoute?: (id: EntityId) => void;
  onPickCoordinate?: (target: MapPickTarget) => void;
  focusSignal?: string;
  areaFocusSignal?: string;
}

const routeColors: Record<RouteSegment['mode'], string> = {
  walking: '#d94b32',
  cycling: '#789267',
  driving: '#d27825',
  taxi: '#d27825',
  transit: '#387f86',
  custom: '#84746d',
};

export function MapCanvas(props: MapCanvasProps) {
  const {
    event,
    selectedStationId,
    selectedRouteId,
    currentStationId,
    arrivedStationIds,
    interactivePick,
    onSelectStation,
    onSelectRoute,
    onPickCoordinate,
    focusSignal,
    areaFocusSignal,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | undefined>(undefined);
  const hotspotTrackerRef = useRef(createHotspotTracker());
  const overlaysRef = useRef<AMapOverlay[]>([]);
  const viewportModeRef = useRef<'fit' | 'area' | 'station' | 'manual'>('fit');
  const fittedDataKeyRef = useRef('');
  const previousFocusSignalRef = useRef<string | undefined>(undefined);
  const previousAreaFocusSignalRef = useRef(areaFocusSignal);
  const [mapError, setMapError] = useState<string>();
  const [mapReady, setMapReady] = useState(false);
  const canUseAmap = hasAmapConfig();
  const viewportDataKey = useMemo(
    () =>
      [
        event.area?.center ? `${event.area.center.lng},${event.area.center.lat}` : '',
        event.itinerary.join(','),
        ...event.stations.map(
          (station) => `${station.id}:${station.coordinate.lng},${station.coordinate.lat}`,
        ),
      ].join('|'),
    [event.area?.center, event.itinerary, event.stations],
  );
  const callbacksRef = useRef({ onSelectStation, onSelectRoute, onPickCoordinate });
  useEffect(() => {
    callbacksRef.current = { onSelectStation, onSelectRoute, onPickCoordinate };
  }, [onSelectStation, onSelectRoute, onPickCoordinate]);

  useEffect(() => {
    if (!canUseAmap || !containerRef.current) return;
    let cancelled = false;
    let removeExplorationListeners = () => {};
    setMapReady(false);
    loadAmap()
      .then((sdk) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new sdk.Map(containerRef.current, {
          zoom: 13,
          viewMode: '2D',
          isHotspot: true,
          mapStyle: 'amap://styles/whitesmoke',
        });
        const mapContainer = containerRef.current;
        const markAsExplored = () => {
          viewportModeRef.current = 'manual';
        };
        mapContainer.addEventListener('pointerdown', markAsExplored);
        mapContainer.addEventListener('wheel', markAsExplored, { passive: true });
        mapContainer.addEventListener('touchstart', markAsExplored, { passive: true });
        removeExplorationListeners = () => {
          mapContainer.removeEventListener('pointerdown', markAsExplored);
          mapContainer.removeEventListener('wheel', markAsExplored);
          mapContainer.removeEventListener('touchstart', markAsExplored);
        };
        setMapReady(true);
        if (interactivePick) {
          mapRef.current.on('hotspotover', (event) => {
            if (!event.lnglat || !event.name) return;
            hotspotTrackerRef.current.enter({
              name: event.name,
              poiId: event.id,
              coordinate: {
                lng: event.lnglat.getLng(),
                lat: event.lnglat.getLat(),
                system: 'GCJ02',
              },
            });
          });
          mapRef.current.on('hotspotout', () => {
            hotspotTrackerRef.current.leave();
          });
          mapRef.current.on(
            'rightclick',
            (event) =>
              event.lnglat &&
              callbacksRef.current.onPickCoordinate?.({
                coordinate: {
                  lng: event.lnglat.getLng(),
                  lat: event.lnglat.getLat(),
                  system: 'GCJ02',
                },
                hotspot: hotspotTrackerRef.current.current,
              }),
          );
        }
      })
      .catch((error: Error) => setMapError(error.message));
    return () => {
      cancelled = true;
      removeExplorationListeners();
      mapRef.current?.destroy();
      mapRef.current = undefined;
      overlaysRef.current = [];
      fittedDataKeyRef.current = '';
      previousFocusSignalRef.current = undefined;
      previousAreaFocusSignalRef.current = undefined;
      viewportModeRef.current = 'fit';
    };
  }, [canUseAmap, interactivePick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let cancelled = false;
    loadAmap()
      .then((sdk) => {
        if (cancelled || mapRef.current !== map) return;
        if (overlaysRef.current.length) map.remove(overlaysRef.current);
        const stationIndex = new Map(event.itinerary.map((id, index) => [id, index]));
        const overlays: AMapOverlay[] = [];
        event.routes.forEach((route) => {
          if (route.status === 'stale') return;
          const polyline = new sdk.Polyline({
            path: route.geometry.map((point) => [point.lng, point.lat]),
            strokeColor: routeColors[route.mode],
            strokeWeight: route.id === selectedRouteId ? 8 : 5,
            strokeOpacity: route.status === 'ready' ? 0.78 : 0.58,
            strokeStyle: route.status === 'ready' ? 'solid' : 'dashed',
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: 20,
          });
          polyline.on('click', () => callbacksRef.current.onSelectRoute?.(route.id));
          overlays.push(polyline);
        });
        event.stations.forEach((station) => {
          const index = stationIndex.get(station.id) ?? -1;
          const isPast = arrivedStationIds?.includes(station.id);
          const content = createStationMarkerContent(
            station,
            index,
            station.id === currentStationId,
            isPast,
          );
          const marker = new sdk.Marker({
            position: [station.coordinate.lng, station.coordinate.lat],
            content,
            anchor: 'bottom-center',
            offset: new sdk.Pixel(0, -4),
            zIndex: station.id === currentStationId ? 120 : 100,
          });
          marker.on('click', () => callbacksRef.current.onSelectStation?.(station.id));
          overlays.push(marker);
        });
        map.add(overlays);
        overlaysRef.current = overlays;
        const dataChanged = fittedDataKeyRef.current !== viewportDataKey;
        const focusRequested = previousFocusSignalRef.current !== focusSignal;
        const areaFocusRequested =
          areaFocusSignal !== undefined && previousAreaFocusSignalRef.current !== areaFocusSignal;
        const selectedStation = event.stations.find((item) => item.id === selectedStationId);
        const viewportAction = decideMapViewport({
          areaFocusRequested,
          hasAreaCenter: Boolean(event.area?.center),
          hasSelectedStation: Boolean(selectedStation),
          hasOverlays: overlays.length > 0,
          dataChanged,
          focusRequested,
        });
        if (viewportAction === 'area' && event.area?.center) {
          viewportModeRef.current = 'area';
          map.setZoomAndCenter(11, [event.area.center.lng, event.area.center.lat]);
        } else if (viewportAction === 'station' && selectedStation) {
          viewportModeRef.current = 'station';
          map.setZoomAndCenter(15, [
            selectedStation.coordinate.lng,
            selectedStation.coordinate.lat,
          ]);
        } else if (viewportAction === 'fit') {
          viewportModeRef.current = 'fit';
          map.setFitView(overlays, false, [80, 80, 120, 80]);
        }
        fittedDataKeyRef.current = viewportDataKey;
        previousFocusSignalRef.current = focusSignal;
        previousAreaFocusSignalRef.current = areaFocusSignal;
      })
      .catch((error: Error) => {
        if (!cancelled) setMapError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [
    event,
    selectedStationId,
    selectedRouteId,
    currentStationId,
    arrivedStationIds,
    focusSignal,
    areaFocusSignal,
    mapReady,
    viewportDataKey,
  ]);

  useEffect(() => {
    if (!mapReady || !containerRef.current || typeof ResizeObserver === 'undefined') return;
    let animationFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const map = mapRef.current;
        if (!map) return;
        map.resize();
        if (viewportModeRef.current === 'fit' && overlaysRef.current.length) {
          map.setFitView(overlaysRef.current, false, [80, 80, 120, 80]);
        }
      });
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [mapReady]);

  if (!canUseAmap || mapError) return <FallbackMap {...props} message={mapError} />;
  return (
    <div className="map-canvas" aria-label="聚餐行程地图" aria-busy={!mapReady}>
      <div ref={containerRef} className="map-sdk" />
      {!mapReady && (
        <div className="map-loading-fallback">
          <FallbackMap {...props} />
        </div>
      )}
      <div className="map-attribution">高德地图 · 路线为发布时结果</div>
    </div>
  );
}

function FallbackMap(props: MapCanvasProps & { message?: string }) {
  const points = useMemo(() => {
    const source = props.event.stations.length ? props.event.stations : [];
    if (!source.length) return new Map<EntityId, { x: number; y: number }>();
    const lngs = source.map((station) => station.coordinate.lng);
    const lats = source.map((station) => station.coordinate.lat);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const rangeLng = maxLng - minLng || 0.02;
    const rangeLat = maxLat - minLat || 0.02;
    return new Map(
      source.map((station) => [
        station.id,
        {
          x: 16 + ((station.coordinate.lng - minLng) / rangeLng) * 68,
          y: 82 - ((station.coordinate.lat - minLat) / rangeLat) * 64,
        },
      ]),
    );
  }, [props.event.stations]);
  const stationIndex = new Map(props.event.itinerary.map((id, index) => [id, index]));
  return (
    <div className="map-canvas fallback-map" role="region" aria-label="行程路线示意图">
      <div className="paper-grain" />
      <svg
        className="route-sketch"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {props.event.routes.map((route) => {
          if (route.status === 'stale') return null;
          const from = points.get(route.fromStationId);
          const to = points.get(route.toStationId);
          if (!from || !to) return null;
          const middleX = (from.x + to.x) / 2 + 4;
          const middleY = (from.y + to.y) / 2 - 3;
          return (
            <path
              key={route.id}
              d={`M ${from.x} ${from.y} Q ${middleX} ${middleY} ${to.x} ${to.y}`}
              stroke={routeColors[route.mode]}
              className={route.status === 'ready' ? '' : 'dashed'}
              onClick={() => props.onSelectRoute?.(route.id)}
              tabIndex={props.onSelectRoute ? 0 : undefined}
              role={props.onSelectRoute ? 'button' : undefined}
              aria-label={props.onSelectRoute ? `${route.mode}路线` : undefined}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                  keyboardEvent.preventDefault();
                  props.onSelectRoute?.(route.id);
                }
              }}
            />
          );
        })}
      </svg>
      {props.event.stations.map((station) => {
        const point = points.get(station.id);
        if (!point) return null;
        const past = props.arrivedStationIds?.includes(station.id);
        return (
          <button
            key={station.id}
            type="button"
            className={`table-marker ${station.id === props.currentStationId ? 'is-current' : ''} ${past ? 'is-past' : ''} ${station.id === props.selectedStationId ? 'is-selected' : ''}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            onClick={() => props.onSelectStation?.(station.id)}
            aria-label={
              stationIndex.has(station.id)
                ? `第${(stationIndex.get(station.id) ?? 0) + 1}站 ${station.shortName}`
                : `待安排站点 ${station.shortName}`
            }
          >
            <b>{stationIndex.has(station.id) ? (stationIndex.get(station.id) ?? 0) + 1 : '待'}</b>
            <span>{formatStationTimeRange(station)}</span>
            <strong>{station.shortName}</strong>
          </button>
        );
      })}
      <div className="fallback-note">
        <MapPinned size={16} /> 路线示意图
      </div>
      {!props.event.stations.length && props.event.area && (
        <div className="area-placeholder">
          <MapPinned />
          <strong>{props.event.area.district || props.event.area.city}</strong>
          <span>已按所选地区大概定位，添加地点后显示实际路线</span>
        </div>
      )}
      {props.message && (
        <div className="map-warning" role="alert">
          <AlertCircle size={16} />
          {props.message}
        </div>
      )}
    </div>
  );
}
