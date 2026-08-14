export type MapViewportAction = 'area' | 'area-code' | 'station' | 'fit' | 'none';

export function decideMapViewport(input: {
  areaFocusRequested: boolean;
  hasAreaCenter: boolean;
  hasAreaCode: boolean;
  hasSelectedStation: boolean;
  hasOverlays: boolean;
  dataChanged: boolean;
  focusRequested: boolean;
}): MapViewportAction {
  if (input.areaFocusRequested && input.hasAreaCenter) return 'area';
  if (input.areaFocusRequested && input.hasAreaCode) return 'area-code';
  if (input.hasSelectedStation) return 'station';
  if (input.hasOverlays && (input.dataChanged || input.focusRequested)) return 'fit';
  if (!input.hasOverlays && input.hasAreaCenter && (input.dataChanged || input.focusRequested))
    return 'area';
  return 'none';
}
