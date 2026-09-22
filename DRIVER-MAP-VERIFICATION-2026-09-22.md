# Driver map and automatic GPS — 2026-09-22

The driver waiting page now uses MapLibre/OpenFreeMap with the driver's truck and the pickup points from their authenticated, unexpired order invitations. Selecting a pickup shows the pickup address, destination text, requested truck type (Чирэгч / Бүтэн ачигч), car details, straight-line distance and price submission. Destination coordinates are not collected by the current booking flow, so no destination pin or road route is invented.

The manual location panel is removed. A restored working session starts GPS automatically. Updates are throttled to 15 seconds with a 45-second stationary heartbeat; returning to the page or reconnecting also retries. Resting, pending payment, unmounting and session loss stop the web tracker. An accepted trip keeps tracking while busy. GPS heartbeats never set availability to true. The Android app retains its existing native location service without a duplicate web watcher. Starting work requests a current fix before marking the driver available.

Orders still refresh every 5 seconds while visible and on existing push/visibility events. Cancelled/expired orders disappear. Price drafts are preserved per order, and offer submission uses the server-maintained driver location. Existing selection, phone privacy, trip completion and payment flows remain in use.

## Verification

- `node --test tests/*.test.cjs`: 121 passed, including 12 new GPS, map and driver interaction/lifecycle cases.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and all 47 pages.
- Tests cover automatic session tracking, rest/trip/payment transitions, native GPS ownership, initial and stationary GPS uploads, throttling, network retry, permission errors, cleanup/late responses, both map markers and bounds, selection, expired order removal, no fabricated coordinates, order details and separate price drafts.
- The order API already returns the required fields and restricts them to the authenticated driver's invitations. No database migration or new API permission is needed.

## Remaining device checks

Real phone GPS movement, mobile keyboard rendering, WebGL tile rendering, screen-lock behavior and push delivery were not physically verified in this environment. An isolated static mobile-layout fixture could not be opened by the cloud browser. Automated component checks do not replace a real device run. The browser version needs location permission and an open page; continuous background GPS belongs to the Android app. No production customer, driver or order was created for these tests.
