import { describe, it, expect } from 'vitest';
import { DashboardKeyDetector } from './dashboard-key-detector';

const det = new DashboardKeyDetector();

describe('DashboardKeyDetector', () => {
  it('only treats known provider hosts as scannable', () => {
    expect(det.isProviderHost('platform.openai.com')).toBe(true);
    expect(det.isProviderHost('console.anthropic.com')).toBe(true);
    expect(det.isProviderHost('random-blog.example')).toBe(false);
  });

  it('detects an OpenAI key on the OpenAI dashboard', () => {
    const found = det.detect({
      host: 'platform.openai.com',
      samples: ['Your key: sk-proj-AbCdEf0123456789ghIJklMNop'],
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ provider: 'openai', kind: 'api_key' });
    expect(found[0]!.secret).toMatch(/^sk-proj-/);
  });

  it('attributes a bare sk- key to the host it was found on (DeepSeek)', () => {
    const found = det.detect({
      host: 'platform.deepseek.com',
      samples: ['sk-0123456789abcdef0123456789abcdef'],
    });
    expect(found[0]?.provider).toBe('deepseek');
  });

  it('matches the Anthropic pattern, not OpenAI, on the Anthropic host', () => {
    const found = det.detect({
      host: 'console.anthropic.com',
      samples: ['sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'],
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.provider).toBe('anthropic');
  });

  it('detects a Google Gemini key by the AIza shape', () => {
    const found = det.detect({
      host: 'aistudio.google.com',
      samples: ['AIzaSyA1234567890abcdEFGHijklmnopQRSTUV'],
    });
    expect(found[0]?.provider).toBe('google');
  });

  it('does NOT scan for keys on an unknown host', () => {
    const found = det.detect({
      host: 'phishing.example',
      samples: ['sk-proj-AbCdEf0123456789ghIJklMNop'],
    });
    expect(found).toEqual([]);
  });

  it('recognises a Google service-account auth JSON', () => {
    const json = JSON.stringify({
      type: 'service_account',
      project_id: 'demo',
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
      client_email: 'svc@demo.iam.gserviceaccount.com',
    });
    const found = det.detect({ host: 'console.cloud.google.com', samples: [json] });
    expect(found[0]).toMatchObject({ provider: 'google', kind: 'auth_json' });
  });

  it('de-duplicates the same secret seen in multiple samples', () => {
    const key = 'sk-proj-AbCdEf0123456789ghIJklMNop';
    const found = det.detect({ host: 'platform.openai.com', samples: [key, `prefix ${key} suffix`] });
    expect(found).toHaveLength(1);
  });
});
