import { describe, expect, it } from 'vitest';
import { createSampleEvent } from '../src/domain/sample';
import { parseMapShareLink } from '../src/maps/link-parser';
import {
  reconcileRoutes,
  recalculateRoute,
  recalculateStaleRoutes,
  routeIdentity,
} from '../src/maps/routes';
import type { MapService } from '../src/maps/types';
import { inferCurrentStation, sanitizeViewerState } from '../src/viewer/progress';
import { mapReverseGeocodeResult, parseAmapRouteResult } from '../src/maps/amap-service';
import { createHotspotTracker, resolveMapPickTarget } from '../src/maps/pick';
import { areaSearchRequest, buildArea } from '../src/domain/areas';
import { decideMapViewport } from '../src/maps/viewport';

describe('maps and progress', () => {
  it('uses administrative codes and the matching AMap level for area lookup', () => {
    const city = buildArea('440000', '440100');
    const district = buildArea('440000', '440100', '440106');
    const municipality = buildArea('110000', '110100');

    expect(city && areaSearchRequest(city)).toEqual({
      keyword: '440100',
      level: 'city',
      fallbackAddress: '广东省广州市',
    });
    expect(district && areaSearchRequest(district)).toEqual({
      keyword: '440106',
      level: 'district',
      fallbackAddress: '广东省广州市天河区',
    });
    expect(municipality && areaSearchRequest(municipality)).toEqual({
      keyword: '110000',
      level: 'province',
      fallbackAddress: '北京市',
    });
  });

  it('prioritizes an explicit area recenter even when stations already exist', () => {
    expect(
      decideMapViewport({
        areaFocusRequested: true,
        hasAreaCenter: true,
        hasAreaCode: true,
        hasSelectedStation: true,
        hasOverlays: true,
        dataChanged: true,
        focusRequested: false,
      }),
    ).toBe('area');
    expect(
      decideMapViewport({
        areaFocusRequested: false,
        hasAreaCenter: true,
        hasAreaCode: true,
        hasSelectedStation: false,
        hasOverlays: false,
        dataChanged: true,
        focusRequested: false,
      }),
    ).toBe('area');
    expect(
      decideMapViewport({
        areaFocusRequested: true,
        hasAreaCenter: false,
        hasAreaCode: true,
        hasSelectedStation: false,
        hasOverlays: true,
        dataChanged: true,
        focusRequested: false,
      }),
    ).toBe('area-code');
  });

  it('maps reverse geocoding to the nearest POI and falls back to an address', () => {
    const coordinate = { lng: 121.47, lat: 31.23, system: 'GCJ02' as const };
    expect(
      mapReverseGeocodeResult(
        {
          regeocode: {
            formattedAddress: '上海市黄浦区人民大道200号',
            pois: [{ id: 'poi_1', name: '上海博物馆' }],
            roads: [{ name: '人民大道' }],
          },
        },
        coordinate,
      ),
    ).toMatchObject({ name: '上海博物馆', address: '上海市黄浦区人民大道200号', poiId: 'poi_1' });
    expect(
      mapReverseGeocodeResult(
        { regeocode: { formattedAddress: '广东省广州市天河区体育西路', pois: [], roads: [] } },
        coordinate,
      ).name,
    ).toBe('广东省广州市天河区体育西路');
  });

  it('selects the hovered label exactly and clears it after pointer leave', async () => {
    const coordinate = { lng: 121.48, lat: 31.24, system: 'GCJ02' as const };
    const tracker = createHotspotTracker();
    tracker.enter({ name: '外滩源', poiId: 'B0001', coordinate });
    expect(tracker.current?.name).toBe('外滩源');

    let reverseCalls = 0;
    const service: MapService = {
      searchPlaces: async () => [],
      enrichHotspot: async (hotspot) => ({ ...hotspot, address: '上海市黄浦区圆明园路' }),
      reverseGeocode: async (point) => {
        reverseCalls += 1;
        return { name: '附近地点', address: '附近地址', coordinate: point };
      },
      resolveAreaCenter: async () => coordinate,
      calculateRoute: async () => ({ distanceMeters: 1, durationMinutes: 1, geometry: [] }),
    };
    expect(
      (await resolveMapPickTarget(service, { coordinate, hotspot: tracker.current })).name,
    ).toBe('外滩源');
    expect(reverseCalls).toBe(0);

    tracker.leave();
    expect(tracker.current).toBeUndefined();
    expect((await resolveMapPickTarget(service, { coordinate })).name).toBe('附近地点');
    expect(reverseCalls).toBe(1);
  });

  it('parses coordinate share links and preserves unresolved short links', () => {
    const parsed = parseMapShareLink(
      'https://uri.amap.com/marker?name=火锅&longitude=121.5&latitude=31.2',
    );
    expect(parsed.candidate?.coordinate?.lng).toBe(121.5);
    const fallback = parseMapShareLink('https://surl.amap.com/abc');
    expect(fallback.fallbackRequired).toBe(true);
    expect(fallback.sourceUrl).toContain('surl.amap.com');
  });

  it('reuses unchanged routes and invalidates changed adjacency', () => {
    const event = createSampleEvent();
    const first = event.routes[0];
    expect(routeIdentity(event.stations[0], event.stations[1], 'walking')).toContain('s_hotpot');
    const unchanged = reconcileRoutes(event);
    expect(unchanged[0].id).toBe(first.id);
    event.itinerary = ['s_hotpot', 's_river', 's_cafe', 's_ktv'];
    const changed = reconcileRoutes(event);
    expect(changed[0].status).toBe('stale');
  });

  it('invalidates legacy ready routes that only contain a straight endpoint line', () => {
    const event = createSampleEvent();
    event.routes[0].geometry = [event.stations[0].coordinate, event.stations[1].coordinate];

    expect(reconcileRoutes(event)[0].status).toBe('stale');
  });

  it('parses riding and nested transit road geometry instead of using endpoint lines', () => {
    expect(
      parseAmapRouteResult({
        routes: [
          {
            distance: 1200,
            time: 360,
            rides: [
              {
                path: [
                  { lng: 1, lat: 1 },
                  { lng: 1.5, lat: 1.4 },
                  { lng: 2, lat: 2 },
                ],
              },
            ],
          },
        ],
      }).geometry,
    ).toHaveLength(3);
    expect(
      parseAmapRouteResult({
        plans: [
          {
            time: 900,
            segments: [
              {
                walking: {
                  steps: [
                    {
                      path: [
                        { lng: 1, lat: 1 },
                        { lng: 1.2, lat: 1.2 },
                      ],
                    },
                  ],
                },
              },
              {
                bus: {
                  buslines: [
                    {
                      path: [
                        { lng: 1.2, lat: 1.2 },
                        { lng: 2, lat: 2 },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }).geometry,
    ).toHaveLength(4);
  });

  it('freezes successful routes and falls back on failure', async () => {
    const event = createSampleEvent();
    const service: MapService = {
      searchPlaces: async () => [],
      enrichHotspot: async (hotspot) => ({ ...hotspot, address: '热点地址' }),
      reverseGeocode: async (coordinate) => ({ name: '测试地点', address: '测试地址', coordinate }),
      resolveAreaCenter: async () => ({ lng: 121.47, lat: 31.23 }),
      calculateRoute: async () => ({
        distanceMeters: 1000,
        durationMinutes: 10,
        geometry: [
          { lng: 1, lat: 1 },
          { lng: 2, lat: 2 },
        ],
      }),
    };
    const ready = await recalculateRoute(event, event.routes[0].id, service);
    expect(ready.status).toBe('ready');
    expect(ready.distanceMeters).toBe(1000);
    const failed = await recalculateRoute(event, event.routes[0].id, {
      ...service,
      calculateRoute: async () => {
        throw new Error('fail');
      },
    });
    expect(failed.status).toBe('fallback');
    expect(failed.geometry).toHaveLength(2);
    const emptyGeometry = await recalculateRoute(event, event.routes[0].id, {
      ...service,
      calculateRoute: async () => ({
        distanceMeters: 1000,
        durationMinutes: 10,
        geometry: [],
      }),
    });
    expect(emptyGeometry.status).toBe('fallback');
  });

  it('automatically calculates stale routes with their selected transport mode', async () => {
    const event = createSampleEvent();
    event.itinerary = ['s_hotpot', 's_river'];
    event.routes = reconcileRoutes(event);
    event.routes[0].mode = 'cycling';
    event.routes[0].identityKey = routeIdentity(event.stations[0], event.stations[2], 'cycling');
    const requestedModes: string[] = [];
    const service: MapService = {
      searchPlaces: async () => [],
      enrichHotspot: async (hotspot) => ({ ...hotspot, address: '' }),
      reverseGeocode: async (coordinate) => ({ name: '', address: '', coordinate }),
      resolveAreaCenter: async () => ({ lng: 121.47, lat: 31.23 }),
      calculateRoute: async (request) => {
        requestedModes.push(request.mode);
        return {
          distanceMeters: 800,
          durationMinutes: 5,
          geometry: [
            { lng: 1, lat: 1 },
            { lng: 1.5, lat: 1.3 },
            { lng: 2, lat: 2 },
          ],
        };
      },
    };

    const routes = await recalculateStaleRoutes(event, service);

    expect(requestedModes).toEqual(['cycling']);
    expect(routes[0]).toMatchObject({ mode: 'cycling', status: 'ready', durationMinutes: 5 });
    expect(routes[0].geometry).toHaveLength(3);
  });

  it('prefers manual current station and otherwise infers exact time', () => {
    const event = createSampleEvent();
    event.date = '2026-08-20';
    expect(
      inferCurrentStation(
        event,
        { currentStationId: 's_ktv', arrivedStationIds: [], mode: 'step' },
        new Date('2026-08-20T14:45:00'),
      ),
    ).toBe('s_ktv');
    expect(
      inferCurrentStation(
        event,
        { arrivedStationIds: [], mode: 'overview' },
        new Date('2026-08-20T14:45:00'),
      ),
    ).toBe('s_cafe');
  });

  it('uses local activity dates, chooses the latest started station, and supports midnight', () => {
    const event = createSampleEvent();
    event.date = '2026-08-20';

    expect(
      inferCurrentStation(
        event,
        { arrivedStationIds: [], mode: 'overview' },
        new Date(2026, 7, 19, 23, 30),
      ),
    ).toBeUndefined();
    expect(
      inferCurrentStation(
        event,
        { arrivedStationIds: [], mode: 'overview' },
        new Date(2026, 7, 20, 21, 0),
      ),
    ).toBe('s_ktv');

    const ktv = event.stations.find((station) => station.id === 's_ktv');
    if (!ktv) throw new Error('missing sample station');
    ktv.start = { kind: 'exact', time: '23:00', dayOffset: 0 };
    ktv.end = { time: '01:30', dayOffset: 1 };
    expect(
      inferCurrentStation(
        event,
        { arrivedStationIds: [], mode: 'overview' },
        new Date(2026, 7, 21, 0, 30),
      ),
    ).toBe('s_ktv');
  });

  it('drops viewer progress references that no longer exist in an updated event', () => {
    const event = createSampleEvent();
    expect(
      sanitizeViewerState(event, {
        participantId: 'deleted-person',
        currentStationId: 'deleted-station',
        arrivedStationIds: ['s_hotpot', 'deleted-station', 's_hotpot'],
        mode: 'step',
        focusedStationId: 'deleted-station',
      }),
    ).toEqual({
      participantId: undefined,
      currentStationId: undefined,
      arrivedStationIds: ['s_hotpot'],
      mode: 'step',
      focusedStationId: undefined,
    });
  });
});
