# Self-hosting

## Docker Compose

```sh
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:3001/api/health
```

Only `127.0.0.1:3001` is published. To stop your instance:

```sh
docker compose down
```

The container runs standard Playwright Chromium as a non-root user. `docker/seccomp_profile.json` is the upstream Playwright profile allowing user-namespace syscalls. Compose reserves 512 MB shared memory, caps memory at 2 GB, CPU at two cores, and process count at 256. Keep a host margin for the Docker daemon and Chromium startup.

The app filesystem is read-only. `/tmp` and `/app/artifacts` use bounded temporary filesystems. Context profiles are ephemeral. There are no volumes, credentials, or environment files required for the default local-browser reader.

For public use, place an HTTPS reverse proxy in front of the loopback listener, keep CDP and proxy ports private, and run the worker on an isolated host/network. The HTTP healthcheck verifies service availability only. Reddit may still block that host. Do not advertise live compatibility unless your own live assertions retrieve the content.

## Diagnostics

Set the Compose `DIAGNOSTICS` value to `"true"` and recreate the service for a bounded investigation. Diagnostics remain in the restricted ephemeral artifacts directory and disappear with container replacement. Copy them for private local inspection only; do not publish raw snapshots or provider session URLs.

## Browser tests in Docker

Use a disposable test container built from the same image:

```sh
docker build -t threadglass:test .
docker run --rm --init --shm-size=512m \
  --security-opt seccomp=./docker/seccomp_profile.json \
  threadglass:test npm run check
docker run --rm --init --shm-size=512m \
  --security-opt seccomp=./docker/seccomp_profile.json \
  threadglass:test npm run test:e2e
```

For a live run with private screenshots and output kept inside a named container:

```sh
docker run --name threadglass-live-check --init --shm-size=512m \
  --security-opt seccomp=./docker/seccomp_profile.json \
  -e DIAGNOSTICS=true threadglass:test npm run test:live
docker cp threadglass-live-check:/app/artifacts ./artifacts
docker rm threadglass-live-check
```

A live run exits nonzero when content assertions are not verified; collect the report even on failure. Container removal does not affect the public repository or deployed instance.

## Operator-only cloud test

The default service never needs a cloud key. To reproduce the separate Browser Use experiment, provide `BROWSER_USE_API_KEY` through your shell or secret manager, then run:

```sh
node --import tsx scripts/cloud-live.ts
```

To use the provider's standard proxy route, set `BROWSER_USE_PROXY_COUNTRY=us`. This changes the provider's billable network path and records that choice in its report. The script provisions a five-minute session, uses only fixed test URLs, and explicitly stops the browser even on errors. Billing rates and account limits belong to the provider; check them before running. The script does not log the key, CDP URL, or session ID. Raw cloud screenshots and DOM snapshots remain under ignored `artifacts/`.

This CLI experiment is not exposed to anonymous web users and does not make the provider a verified public-worker backend. Never bake its key into a Docker image. Remove test containers holding secret environment variables after collecting artifacts.

The separately approved managed test is reproduced only with an explicit operator opt-in: `BROWSER_USE_SOLVE_CAPTCHAS=true BROWSER_USE_PROXY_COUNTRY=us node --import tsx scripts/cloud-live.ts`. That mode enables provider CAPTCHA handling and required Google reCAPTCHA resources, and limits itself to the two fixed POC pages. It is not used by the public backend.
