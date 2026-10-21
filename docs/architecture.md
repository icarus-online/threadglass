# Architecture

Threadglass is a TypeScript monorepo-sized application with one Node process and one React build. There is no database, task broker, or Reddit API dependency.

| Surface                  | Purpose                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `server/index.ts`        | Same-origin API, validated JSON, abuse limits, bounded cache, structured errors, static reader         |
| `server/browser.ts`      | Browser lifecycle, concurrency admission, total budgets, cancellation, context cleanup, diagnostics    |
| `server/egress.ts`       | Loopback CONNECT proxy, hostname allowlist, public-DNS validation, numeric-IP pinning                  |
| `server/interactions.ts` | Targeted app-promotion dismissal and comment expansion using accessible controls                       |
| `server/extract-page.ts` | Serialization boundary between Node TypeScript and the browser evaluation context                      |
| `shared/extract.ts`      | `reddit-dom-v1`: normalized extraction from rendered modern/legacy DOM and open shadow roots           |
| `shared/schema.ts`       | Shared discussion, post, comment tree, rich text, media, evidence, continuation and availability types |
| `server/normalize.ts`    | Server sanitization, media validation and permalink restrictions                                       |
| `src/App.tsx`            | Accessible responsive reader shared by remote and local modes                                          |
| `src/local.tsx`          | Optional userscript entry: snapshot already-loaded DOM, shadow-root reader, reversible exit            |
| `scripts/live.ts`        | Strict local-browser acceptance assertions and private diagnostic artifacts                            |
| `scripts/cloud-live.ts`  | Separate operator-only Browser Use compatibility experiment                                            |

## Request lifecycle

```mermaid
sequenceDiagram
  participant R as Reader
  participant A as Node API
  participant W as Browser service
  participant C as Chromium context
  participant P as Egress proxy
  participant S as Reddit
  R->>A: POST supported Reddit URL + viewport
  A->>A: Validate, limit, check bounded cache
  A->>W: Read with cancellation signal
  W->>W: Admit or return busy; start total deadline
  W->>C: Fresh signed-out context in reused browser
  C->>P: HTTPS CONNECT allowlisted hostname
  P->>P: Validate every DNS answer; pin numeric IP
  P->>S: Connect to pinned public address
  S-->>C: Webpage and dynamic public content
  C->>C: Meaningful DOM readiness and targeted controls
  C-->>W: DOM snapshot with nested relationships
  W->>W: Classify source availability; sanitize
  W-->>A: Discussion + evidence, or structured worker error
  W->>C: Close context in finally
  A-->>R: Normalized snapshot
```

DOM readiness uses post/comment elements, explicit challenge/login/rate-limit messages, navigation events, and comment-count changes. There are no fixed sleep loops. Interaction is bounded to six scroll rounds and 24 attempted clicks; expansion only targets recognized comment controls. A final count of remaining controls marks a snapshot as partial. The UI does not promise the entire thread even when a snapshot is classified `public`.

Continuation links are extracted as supported URLs and offered as explicit reader navigation. They are not crawled recursively. Spoiler spans become closed native disclosure elements; native video controls remain user-operated. External video embeds become source links. Embedded players whose media URLs exist only in opaque script state are not reconstructed.

## Classification

| Status                | Evidence and behavior                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `public`              | Supported public post/listing content was rendered; no observed incompleteness signal                 |
| `partial`             | Content retrieved, but comments/controls or an interrupted rendering budget indicate missing material |
| `promotional_overlay` | App promotion identified structurally; underlying loaded content is still extracted where present     |
| `render_failure`      | No supported discussion and no stronger source-state evidence                                         |
| `network_failure`     | Navigation failed without source content or a stronger source-state signal                            |
| `rate_limited`        | HTTP 429 or a clear rate-limit message                                                                |
| `login_required`      | Explicit authentication/age-access requirement or HTTP 401 without public content                     |
| `source_blocked`      | Network-security block, verification challenge, access denied, or HTTP 403 without public content     |

HTTP 200 is not evidence that the thread was retrieved. A block page can return 200. A promotion is not an authentication requirement. Source outcomes are distinct from transport/configuration errors such as invalid URL, busy service, cancelled request, timeout, or launch failure.

Missing authors are represented as deleted/unknown source markers; missing scores and timestamps stay null. Comment relationships are preserved where present. Missing parent records remain root entries rather than fabricated parents. Cycles or structurally excessive parent chains are not reintroduced into the reader.

## Remote and local modes

Remote reading uses the server and its pinned egress proxy. Local cleanup uses the same extractor/schema/React components inside a shadow root, without server extraction. Local mode takes a snapshot and does not click or expand the original source page automatically. It restores the original page on exit.

Remote CDP support requires equivalent remote egress enforcement. Browser Use's independently controlled compatibility script is not currently a public backend option; connecting to a provider is not sufficient proof of SSRF enforcement. Provider integration and live successful extraction remain separate acceptance gates.
