import { z } from 'zod';
export const statuses = [
  'public',
  'partial',
  'promotional_overlay',
  'render_failure',
  'network_failure',
  'rate_limited',
  'login_required',
  'source_blocked',
] as const;
export type Availability = (typeof statuses)[number];
export interface Author {
  name: string;
  deleted: boolean;
}
export interface ContentBlock {
  type: 'html';
  html: string;
}
export interface Media {
  kind: 'image' | 'video' | 'embed';
  url: string;
  poster?: string;
  alt: string;
}
export interface Comment {
  id: string;
  parentId: string | null;
  author: Author;
  timestamp: string | null;
  score: string | null;
  blocks: ContentBlock[];
  permalink: string;
  depth: number;
  children: Comment[];
}
export interface Post {
  id: string;
  title: string;
  author: Author;
  subreddit: string;
  timestamp: string | null;
  score: string | null;
  blocks: ContentBlock[];
  media: Media[];
  permalink: string;
  archived: boolean;
  locked: boolean;
  commentCount: string | null;
}
export interface Continuation {
  url: string;
  label: string;
  parentId: string | null;
}
export interface Discussion {
  schemaVersion: 1;
  adapterVersion: string;
  url: string;
  fetchedAt: string;
  status: Availability;
  message: string;
  post: Post | null;
  comments: Comment[];
  listing: Post[];
  evidence: {
    renderedComments: number;
    expansionAttempts: number;
    remainingControls: number;
    httpStatus: number | null;
    viewport: 'desktop' | 'mobile';
    elapsedMs: number;
    diagnosticsId?: string;
  };
  warnings: string[];
  continuations: Continuation[];
}
export const readRequest = z
  .object({
    url: z.string().min(1).max(2048),
    viewport: z.enum(['desktop', 'mobile']).default('desktop'),
  })
  .strict();
export interface ReadInput {
  url: string;
  viewport: 'desktop' | 'mobile';
}
