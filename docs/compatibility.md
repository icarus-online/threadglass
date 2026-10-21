# Real-world compatibility

This report separates real browser visits from synthetic fixture coverage. No search snippets or mocked network responses count as live extraction evidence.

**A later, explicitly approved managed-cloud test retrieved the real ELI5 title and 25 comment bodies.** Standard local reading remains blocked from the test host, and the complete live acceptance matrix is not yet verified.

## Browser runs

| Run                            | Browser/environment                                                                                            | Result                                                           | Retrieved discussion                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Standard local browser         | Sandboxed Chromium 153, Playwright 1.63.0, non-root Docker, fresh signed-out contexts, pinned public-IP egress | All 10 scenarios: Reddit network-security block, HTTP 200        | No titles, bodies, comments, or listing items |
| Legacy-layout check            | Same worker; `old.reddit.com` archived ELI5 URL                                                                | HTTP 403, classified `source_blocked`                            | None                                          |
| Cloud, direct route            | Browser Use Chromium 154; no profile; CAPTCHA solving off; proxy disabled                                      | All 10 scenarios: HTTP 403, `source_blocked`                     | None                                          |
| Cloud, standard US proxy route | Browser Use Chromium 154; no profile; CAPTCHA solving off                                                      | All 10 scenarios: HTTP 200 challenge page, “Prove your humanity” | None                                          |

The initial cloud-proxy parser labeled the challenge `render_failure`. Inspection of actual screenshots and DOM identified the source verification challenge, and `reddit-dom-v1` was corrected to classify those phrases as `source_blocked`. That correction has a regression test; it does not turn the original run into successful retrieval. The challenge widget's external resources were blocked by the test's strict resource allowlist. The run did not solve a CAPTCHA.

Local run observed: 2026-10-21T00:40:24.839Z.

Direct cloud run observed: 2026-10-21T00:46:17.801Z.

US proxy run observed: 2026-10-21T00:49:42.441Z. Both cloud sessions were explicitly stopped, confirmed by their cleanup reports.

## Approved managed-cloud proof of concept

Observed **2026-10-21T00:54:49.043Z**. After the owner explicitly approved a two-page CAPTCHA-solving test, Browser Use was configured with its standard US proxy route, built-in CAPTCHA handling enabled, no saved profile and no authentication. Required Google reCAPTCHA resources were allowed only in this operator-only experiment.

- The ELI5 thread returned its actual title, author, timestamp, displayed score and **25 comment bodies**, including nested parent-child relationships. Status: `partial`; HTTP 200. No post-body element was present in the rendered snapshot, so no body is claimed or invented.
- The public subreddit listing returned a rate-limit page. No listing content was retrieved.
- The paid browser was explicitly stopped; cleanup readback reported success.
- The raw result initially missed Reddit's bare `archived` attribute and included a credit-bar community icon as media. The actual rendered markup was inspected, the adapter was corrected, and a synthetic regression fixture now covers both shapes. The original live artifact is preserved unchanged; no new live pass is claimed for those corrected fields.
- The captured live snapshot was used separately for a private replay in the mobile reader. That verifies presentation of retrieved data, not a new source visit or a production cloud backend.

The managed experiment is restricted to those two fixed POC URLs. It is not the anonymous remote reader backend and does not verify all ten live acceptance scenarios. Its success does not establish connection-level DNS pinning or public-worker egress isolation on the provider's network.

## Requested scenarios

| Scenario                 | Public URL                                                                                                             | Local browser | Direct cloud | US proxy cloud         | Content assertion verified |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------- | ------------ | ---------------------- | -------------------------- |
| archived-eli5            | [Source](https://www.reddit.com/r/explainlikeimfive/comments/208ft5/eli5why_is_earths_core_molten_what_keeps_it_warm/) | source block  | HTTP 403     | verification challenge | No                         |
| large-thread             | [Source](https://www.reddit.com/r/AskReddit/comments/82y1qj/what_is_extremely_common_but_people_think_its/)            | source block  | HTTP 403     | verification challenge | No                         |
| image-post               | [Source](https://www.reddit.com/r/pics/comments/1u58ant/photo_of_my_friends_cousins_door/)                             | source block  | HTTP 403     | verification challenge | No                         |
| video-post               | [Source](https://www.reddit.com/r/animation/comments/1u1wxe7/developing_the_animated_crowns/)                          | source block  | HTTP 403     | verification challenge | No                         |
| deleted-author-candidate | [Source](https://www.reddit.com/r/explainlikeimfive/comments/4quywi/eli5_why_are_pdfs_so_hard_to_edit/)                | source block  | HTTP 403     | verification challenge | No                         |
| deeply-nested            | [Source](https://www.reddit.com/r/AskReddit/comments/82y1qj/what_is_extremely_common_but_people_think_its/)            | source block  | HTTP 403     | verification challenge | No                         |
| app-promotion-candidate  | [Source](https://www.reddit.com/r/explainlikeimfive/comments/208ft5/eli5why_is_earths_core_molten_what_keeps_it_warm/) | source block  | HTTP 403     | verification challenge | No                         |
| genuine-login-candidate  | [Source](https://www.reddit.com/r/lounge/)                                                                             | source block  | HTTP 403     | verification challenge | No                         |
| subreddit-listing        | [Source](https://www.reddit.com/r/explainlikeimfive/)                                                                  | source block  | HTTP 403     | verification challenge | No                         |
| android-viewport         | [Source](https://www.reddit.com/r/explainlikeimfive/comments/208ft5/eli5why_is_earths_core_molten_what_keeps_it_warm/) | source block  | HTTP 403     | verification challenge | No                         |

The table above records the original strict runs; the managed-cloud ELI5 result is recorded separately.

The deleted-author, promotion and genuine-login URLs are candidates: their requested state was not observable behind the network block. In particular, the private-community candidate must not be counted as a successfully tested authentication requirement when a generic network block is all that was served.

## Automated verification

- Unit tests cover URL validation, private/reserved IPv4/IPv6 addresses, content sanitization, browser reuse and independent contexts, cleanup after failure, bounded concurrency, cancellation during launch, total deadline including DNS, and browser-disconnect recovery.
- Real Chromium fixture tests cover nested relationships, deleted-author markers, archived/locked flags, app-promotion dismissal, explicit login versus challenge versus rate-limit classification, reader rendering, collapse/expand, search, bookmarks, dark mode, a userscript with no extraction requests, and layout overflow checks.
- Both desktop (1440×1000) and Android-sized (412×915, touch/mobile emulation) projects are exercised. These are Chromium emulations, not a physical-device claim.
- `npm run check` compiles the shared schema, worker, frontend and scripts; builds the production reader and downloadable userscript; and runs unit checks.
- `npm run licenses` audits the lockfile, explicitly selecting DOMPurify's Apache-2.0 option and recording unmodified MPL-2.0 build dependencies.

Exact final test counts and publication state are recorded in the implementation handoff. GitHub Actions is configured but its result must be checked separately after publication.

## Reproduce and improve

Run the fixed live suite from your own authorized network using the self-hosting instructions. With diagnostics enabled, retain the source screenshot, DOM and normalized data privately. A passing content claim needs a real title/body/comment assertion; the image/video and special-state scenarios need their actual DOM evidence. The live suite exits `2` on incomplete coverage.

Raw screenshots, DOM and normalized Reddit data remain under ignored `artifacts/`; this public report contains only public URLs and aggregate observations. They are not committed or uploaded by normal CI. A handoff or this report is not evidence that Reddit will serve the same result on a different date or network.
