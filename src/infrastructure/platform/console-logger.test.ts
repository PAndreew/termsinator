import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConsoleLogger } from './console-logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConsoleLogger', () => {
  it('suppresses messages below the minimum level', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    new ConsoleLogger('warn').log('info', 'hidden');
    expect(spy).not.toHaveBeenCalled();
  });

  it('routes warn/error to the right console method', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = new ConsoleLogger('debug');
    logger.log('warn', 'w');
    logger.log('error', 'e', { code: 1 });
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('[termsinator] e', { code: 1 });
  });
});
