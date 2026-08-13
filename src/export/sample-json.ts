import { createSampleEvent } from '../domain/sample';
import { exportEventJson } from './data';

export function sampleEventJson(): string {
  return exportEventJson(createSampleEvent());
}
