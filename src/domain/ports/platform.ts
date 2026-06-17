/** Wall-clock, injected so time-dependent logic is testable. */
export interface Clock {
  now(): number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
}

export interface ToastRequest {
  readonly title: string;
  readonly message: string;
  readonly origin: string;
}

/** Shows the non-intrusive notification prompting the user to analyse a site. */
export interface Notifier {
  toast(request: ToastRequest): Promise<void>;
}
