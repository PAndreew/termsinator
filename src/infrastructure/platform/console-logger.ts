import type { Logger, LogLevel } from '../../domain/ports/platform';

/** Logger that writes to the console, prefixed for easy DevTools filtering. */
export class ConsoleLogger implements Logger {
  constructor(private readonly minLevel: LogLevel = 'info') {}

  private static readonly RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (ConsoleLogger.RANK[level] < ConsoleLogger.RANK[this.minLevel]) return;
    const line = `[termsinator] ${message}`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (meta) fn(line, meta);
    else fn(line);
  }
}
