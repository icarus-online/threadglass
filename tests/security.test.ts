import { describe, it, expect } from 'vitest';
import { validateRedditUrl, allowedResource, publicIp, sanitize } from '../server/security.ts';
describe('SSRF boundary', () => {
  it.each([
    'https://www.reddit.com/r/explainlikeimfive/comments/abc123/title/',
    'https://old.reddit.com/r/pics/',
    'https://www.reddit.com/r/AskReddit/comments/abc123/title/def456/?sort=top',
  ])('accepts supported URL %s', (url) => expect(validateRedditUrl(url).protocol).toBe('https:'));
  it.each([
    'http://reddit.com/r/pics/',
    'https://reddit.com.evil.com/r/pics/',
    'https://reddit.com@127.0.0.1/r/pics/',
    'https://reddit.com:8443/r/pics/',
    'https://127.0.0.1/r/pics/',
    'https://www.reddit.com/api/v1/me',
    'https://www.reddit.com/r/pics/comments/abc123.json',
    'file:///etc/passwd',
    'https://www.reddit.com/r/pics/../../api/',
    'https://www.reddit.com/r/pics/%2e%2e/',
  ])('rejects %s', (url) => expect(() => validateRedditUrl(url)).toThrow());
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.2.1',
    '192.168.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '0.0.0.0',
    '224.0.0.1',
    '100.64.0.1',
  ])('blocks private/reserved IP %s', (ip) => expect(publicIp(ip)).toBe(false));
  it('allows public IPs and CDN resources only', () => {
    expect(publicIp('1.1.1.1')).toBe(true);
    expect(allowedResource('https://i.redd.it/image.png')).toBe(true);
    expect(allowedResource('https://i.redd.it.evil.com/image.png')).toBe(false);
    expect(allowedResource('https://localhost/')).toBe(false);
  });
  it('drops unneeded URL queries', () =>
    expect(validateRedditUrl('https://www.reddit.com/r/pics/?token=secret&sort=top').search).toBe(
      '?sort=top',
    ));
});
it('sanitizes scripts, event handlers, forms, unsafe URLs and embeds while preserving reading content', () => {
  const html = sanitize(
    '<script>alert(1)</script><img src=x onerror=alert(1)><p onclick="x()">Safe</p><a href="javascript:alert(1)">bad</a><iframe src="http://127.0.0.1"></iframe><pre><code>x &lt; y</code></pre><table><tr><td>cell</td></tr></table><form><input name=x></form>',
  );
  expect(html).not.toMatch(/script|onerror|onclick|<img|<iframe|<form|<input/);
  expect(html).toContain('<pre><code>');
  expect(html).toContain('<td>cell</td>');
});
