export const navigationHosts = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'm.reddit.com',
  'sh.reddit.com',
]);
export function validateRedditUrl(input: string): URL {
  const u = new URL(input);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !navigationHosts.has(u.hostname) ||
    !/^\/r\/[a-zA-Z0-9_]{2,30}(?:\/(?:comments\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9_%.-]*)?(?:\/[a-zA-Z0-9]+)?\/?)?)?$/.test(
      u.pathname,
    )
  )
    throw new Error('Use an HTTPS Reddit thread or subreddit URL.');
  for (const k of [...u.searchParams.keys()])
    if (!['sort', 't', 'context'].includes(k)) u.searchParams.delete(k);
  u.hash = '';
  return u;
}
