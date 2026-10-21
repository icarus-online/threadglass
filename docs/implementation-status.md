# Implementation status

Observed 2026-10-21. Repository: [icarus-online/threadglass](https://github.com/icarus-online/threadglass), public, original code MIT licensed. This records implementation evidence, not current Reddit serving policy or a production-service guarantee.

## Verified

- Browser worker, pinned-DNS egress proxy, versioned DOM extraction, shared schema, availability classification, sanitization, targeted interaction, bounded lifecycle, cancellation, caching and rate limits implemented.
- Responsive React reader with dark mode, nested collapse, loaded-comment search, navigation, local bookmarks, image viewer, source-media links, code/tables and spoilers implemented.
- Local cleanup userscript shares the schema, extractor and reader; snapshot activation/exit has real Chromium fixture coverage.
- Docker Compose built and ran with a non-root, sandboxed Chromium process, read-only root filesystem, temporary storage, resource limits and loopback-only HTTP publication. HTTP service health and one actual API call were verified. The API accurately reported the source block on the initial host.
- The initial release passed 35 unit tests and 16 browser tests; the subsequent coordination/recovery update adds subscriber, cache, redirect-destination and failure-flow regression coverage. Desktop and Android-size Chromium fixture tests pass, including ordinary reply disclosure, preservation of parent relationships, app promotion versus authentication, availability states and modern bare archive/lock attributes.
- Actual Browser Use managed-cloud output contains the requested archived ELI5 title and 25 comment bodies with nested relationships. A private Android-size reader replay presents that captured output. This is separately labeled from live browser collection.
- Local, legacy, direct-cloud and US-proxy live runs completed with private screenshots, DOM snapshots and structured output. Cloud browser cleanup confirmed stopped sessions. Secret-bearing cloud test containers were removed.
- Dependency license inventory reviewed; DOMPurify's Apache-2.0 option selected; unmodified Lightning CSS MPL-2.0 build dependencies recorded. Distribution includes third-party license texts.

## Pending acceptance

- The default production browser path remains blocked from the initial host.
- A production Browser Use backend is not implemented: its remote egress isolation must be verified before exposing arbitrary supported Reddit reads to anonymous users. The current cloud integration is a fixed-target operator CLI.
- The complete ten-scenario live acceptance matrix is incomplete. Image/video playback, a live deleted-author post, deep nesting, real app-promotion dismissal, genuine authentication requirements and physical Android remain unverified. Candidate URLs alone are not coverage.
- The managed ELI5 snapshot has no post body element; the reader does not invent one. The archived flag/community-icon fixes have DOM regression evidence, not a later live rerun.
- Initial publication CI completed successfully. Each subsequent change must pass its own GitHub Actions run; earlier green CI does not prove later revisions.
- No public web deployment, domain, TLS configuration, database, account system or independent security audit is claimed.

## Next work

1. Keep the real successful snapshot and blocked-case evidence private. Use the compatibility report for public claims.
2. Establish and test a provider-supported remote egress boundary before adding a cloud option to the anonymous backend.
3. Rerun only needed live scenarios with an explicitly selected provider budget and configuration, preserving actual content assertions.
4. Verify source-specific media controls and special-state fixtures against new live markup. Do not change missing fields into inferred content.

## Recovery and cleanup

`docker compose down` stops the task's local service. Default diagnostic storage is temporary. Remove only task-created containers and artifacts; preserve unrelated Docker workloads and repositories. Revert task commits to roll back source changes. Cloud CLI cleanup stops sessions in `finally` with a provider timeout backstop. Never commit raw snapshots, session URLs, environment credentials or cookie exports.

## Coordination and recovery update

The follow-up branch shares identical reads without coupling subscriber cancellation, bounds waiting callers and retained serialized snapshots, adds short source-specific cooldowns, and supplies reader recovery actions. The worker rejects unsupported final redirect destinations before extraction. A scoped static review of the initial eight server modules found no reportable vulnerabilities; it did identify documentation mismatches, now corrected. This review is limited to its recorded baseline and is not a whole-application or runtime security certification. No additional paid cloud sessions or broader CAPTCHA tests were run for this update.

Validation for the coordination/recovery update: 50 unit tests, TypeScript/build/userscript/license checks, and 22 Chromium API/browser tests passed locally. Desktop and Android recovery screenshots were inspected. No new live Reddit compatibility result is claimed.
