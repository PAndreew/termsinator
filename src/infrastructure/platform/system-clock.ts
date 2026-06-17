import type { Clock } from '../../domain/ports/platform';

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
