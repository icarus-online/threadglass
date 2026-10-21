import type { Discussion, Post, Comment } from '../shared/schema.ts';
import { sanitize, allowedResource, allowedEmbed, validateRedditUrl } from './security.ts';
export function cleanDiscussion(result: Discussion): Discussion {
  const permalink = (url: string) => {
    try {
      return validateRedditUrl(url).href;
    } catch {
      return result.url;
    }
  };
  const cleanPost = (p: Post) => {
    p.blocks = p.blocks.map((b) => ({ ...b, html: sanitize(b.html) }));
    p.permalink = permalink(p.permalink);
    p.media = p.media
      .filter((m) => (m.kind === 'embed' ? allowedEmbed(m.url) : allowedResource(m.url)))
      .map((m) => ({ ...m, poster: m.poster && allowedResource(m.poster) ? m.poster : undefined }));
  };
  if (result.post) cleanPost(result.post);
  result.listing.forEach(cleanPost);
  const cleanComments = (cs: Comment[]) => {
    for (const c of cs) {
      c.blocks = c.blocks.map((b) => ({ ...b, html: sanitize(b.html) }));
      c.permalink = permalink(c.permalink);
      cleanComments(c.children);
    }
  };
  cleanComments(result.comments);
  result.continuations = result.continuations.filter((c) => {
    try {
      validateRedditUrl(c.url);
      return true;
    } catch {
      return false;
    }
  });
  return result;
}
