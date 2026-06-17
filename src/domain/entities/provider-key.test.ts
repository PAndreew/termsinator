import { describe, it, expect } from 'vitest';
import { maskSecret } from './provider-key';

describe('maskSecret', () => {
  it('keeps the recognisable prefix and last 4 chars', () => {
    expect(maskSecret('sk-ant-api03-ABCDEFGHIJKLMNOP1234')).toBe('sk-ant-…1234');
    expect(maskSecret('sk-or-v1-deadbeefcafebabe9999')).toBe('sk-or-v1-…9999');
    expect(maskSecret('AIzaSyA1234567890abcdEFGHijklmnopQRSTUV')).toBe('AIza…STUV');
    expect(maskSecret('gsk_abcdefghijklmnopqrstUVWX')).toBe('gsk_…UVWX');
  });

  it('fully hides very short secrets', () => {
    expect(maskSecret('short')).toBe('••••');
  });
});
