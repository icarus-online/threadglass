# Third-party notices

Threadglass's original code is MIT licensed. Its dependencies remain under their own licenses. `npm run licenses` inventories all packages in the committed lockfile, including platform-specific optional packages.

The audit found MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, DOMPurify's dual `(MPL-2.0 OR Apache-2.0)` license, and Lightning CSS's MPL-2.0 license. DOMPurify is used under the Apache-2.0 option. Lightning CSS and its platform binaries are unmodified build dependencies from Vite, not incorporated into Threadglass's original source. Their existing license notices remain with their packages in the Docker image. These dependencies do not acquire Threadglass's MIT license.

- React and React DOM: MIT; Meta Platforms, Inc. and affiliates. <https://github.com/facebook/react>
- DOMPurify: Apache-2.0 option; Cure53 and contributors. <https://github.com/cure53/DOMPurify>
- Playwright: Apache-2.0; Microsoft Corporation. <https://github.com/microsoft/playwright>
- Lightning CSS: MPL-2.0; Devon Govett and contributors. Unmodified source: <https://github.com/parcel-bundler/lightningcss/tree/v1.33.0>
- Playwright's Docker seccomp profile in `docker/seccomp_profile.json` is copied from the Playwright v1.63.0 repository (Apache-2.0), derived from the Docker/Moby profile. <https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json>

The build retains bundled JavaScript license comments. Full installed-package license and notice texts are assembled into `dist/THIRD_PARTY_LICENSES.txt` by `npm run licenses -- --write-notices`. The Docker build runs that command. The generated notices are served with the application and accompany the downloadable userscript distribution. Package-level license files remain in `node_modules` in the container.

Chromium and the base operating system have their own third-party notices and component licenses, retained in the upstream Playwright image. They are not relicensed by this repository. No third-party font assets are downloaded by the reader; it uses system fonts.

Reddit names, logos, community material, post/comment text, and media belong to their respective owners. The software license does not grant ownership or redistribution rights in extracted source content.
