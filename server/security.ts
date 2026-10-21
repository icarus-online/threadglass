import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import sanitizeHtml from 'sanitize-html';
export { navigationHosts, validateRedditUrl } from '../shared/urls.ts';
export function allowedResource(input: string): boolean {
  try {
    const u = new URL(input);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      ['reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com'].some(
        (h) => u.hostname === h || u.hostname.endsWith('.' + h),
      )
    );
  } catch {
    return false;
  }
}
export function publicIp(ip: string): boolean {
  try {
    return ipaddr.process(ip).range() === 'unicast';
  } catch {
    return false;
  }
}
export async function resolvePublic(host: string) {
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((r) => !publicIp(r.address)))
    throw new Error('Destination does not resolve exclusively to public addresses.');
  return records[0]!;
}
export function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      's',
      'del',
      'blockquote',
      'pre',
      'code',
      'a',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'details',
      'summary',
    ],
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
    allowedSchemes: ['https', 'http'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => ({
        tagName: 'a',
        attribs: { ...attrs, rel: 'nofollow noopener noreferrer', target: '_blank' },
      }),
    },
  });
}

export function allowedEmbed(input: string): boolean {
  try {
    const u = new URL(input);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      ['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com'].includes(
        u.hostname,
      )
    );
  } catch {
    return false;
  }
}
