import { describe, it, expect } from 'vitest';
import { LinkTextTermsDiscoverer } from './link-text-terms-discoverer';
import type { AnchorLike } from '../../domain/ports/content';

const d = new LinkTextTermsDiscoverer();
const base = 'https://shop.example/home';

describe('LinkTextTermsDiscoverer', () => {
  it('finds privacy and terms links and resolves relative URLs', () => {
    const anchors: AnchorLike[] = [
      { href: '/legal/privacy', text: 'Privacy Policy' },
      { href: '/legal/tos', text: 'Terms of Service' },
      { href: '/', text: 'Home' },
    ];
    const found = d.discover(anchors, base);
    expect(found.map((c) => c.kind).sort()).toEqual(['privacy', 'terms']);
    expect(found.find((c) => c.kind === 'privacy')?.url).toBe('https://shop.example/legal/privacy');
  });

  it('recognises German, Spanish, French and Chinese link text', () => {
    const anchors: AnchorLike[] = [
      { href: '/d', text: 'Datenschutzerklärung' },
      { href: '/e', text: 'Términos y condiciones' },
      { href: '/f', text: 'Politique de confidentialité' },
      { href: '/c', text: '隐私政策' },
    ];
    const kinds = d.discover(anchors, base).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'privacy').length).toBe(3); // de, fr, zh
    expect(kinds).toContain('terms');
  });

  it('ignores non-navigational and junk links', () => {
    const anchors: AnchorLike[] = [
      { href: '#', text: 'Privacy' },
      { href: 'mailto:a@b.c', text: 'Privacy' },
      { href: 'javascript:void(0)', text: 'Terms' },
      { href: '/about', text: 'About us' },
    ];
    expect(d.discover(anchors, base)).toHaveLength(0);
  });

  it('matches keywords found only in the href', () => {
    const found = d.discover([{ href: '/privacy-policy.html', text: 'Read more' }], base);
    expect(found[0]?.kind).toBe('privacy');
  });

  it('ranks higher-confidence candidates first', () => {
    const found = d.discover(
      [
        { href: '/cookies', text: 'Cookie settings' },
        { href: '/privacy', text: 'Privacy Policy' },
      ],
      base,
    );
    expect(found[0]?.kind).toBe('privacy'); // privacy weight > cookie weight
  });

  it('de-duplicates the same resolved URL', () => {
    const found = d.discover(
      [
        { href: '/privacy', text: 'Privacy' },
        { href: '/privacy#top', text: 'Our Privacy Policy' },
      ],
      base,
    );
    expect(found).toHaveLength(1);
  });
});
