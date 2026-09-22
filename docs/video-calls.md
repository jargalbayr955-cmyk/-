# Accepted-order video calls

Customer `/tracking` (and the confirmed `/drivers` view) and driver `/driver` show
**Видеогоор залгах** at the top only while the order is `confirmed`. Both parties
must keep their connected-order screen open. Incoming calls are checked every
5 seconds while visible. This version does not send background video-call push
notifications or provide an OS call screen. Browser/app backgrounding ends media;
ordinary phone links remain available. Existing location/order notifications are
independent of video calling.

## Activation

The implementation intentionally fails closed until a TURN service is configured.
A public STUN server alone cannot reliably connect different mobile networks.

1. In Cloudflare Realtime TURN, create a TURN key using the
   [official instructions](https://developers.cloudflare.com/realtime/turn/generate-credentials/).
2. Put `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` into the Vercel
   project's server environment for Production (and Preview if testing previews).
   Neither variable is `NEXT_PUBLIC_`. Do not put the token in GitHub or chat.
3. Redeploy. `/api/health` reports `video: configured` when both values are present;
   that is a configuration check, not proof that the provider accepts them.
4. Verify with an accepted customer/driver order on two physical devices, first
   on Wi-Fi, then on different mobile networks. The server's `prepare` action must
   obtain valid TURN credentials. Check receive/reject, video/audio both ways,
   camera switch, muted tracks, hangup, backgrounding, and order completion.

No TURN credentials were available during implementation. Actual provider access,
relay media, iPhone capture, Android runtime permissions and physical device audio
must be validated after activation. The download page offers Android preview
5.5.2, which adds optional camera/microphone permissions and retains the existing
preview package/signing certificate. Version 5.5.1 instructs users to update for
video; ordinary browser calling requires current WebRTC support and HTTPS.

## Security and lifecycle

- The authenticated Next.js POST endpoint uses the explicit customer/driver role
  and derives the actor from its signed session cookie. It checks same origin,
  payload size, rate limits, order membership, account activity and device ownership.
- The service-only `manage_order_video_call` function serializes each order.
  Only the owner and selected driver may call. One active call per order; only
  one callee device claims an answer. Other devices cannot read accepted SDP or
  hang up the active participant's call. Call IDs make start/answer retries safe.
- Video/audio use WebRTC directly or Cloudflare TURN; neither Vercel nor Supabase
  transports or records the media. The API exchanges temporary SDP only.
- Cloudflare credentials expire in 15 minutes. Ringing lasts 60 seconds; active
  calls last up to 10 minutes. A 45-second missing heartbeat expires an active
  database call. The browser closes media on navigation, expiry, revoked access,
  connection failure, or a prolonged failure to reauthorize.
- SDP is held in a private schema with RLS and no client grants. Hangup and order
  completion wipe it. An every-minute `achilt-video-cleanup` cron expires abandoned
  calls and deletes ended-call metadata after one day. No SDP/tokens are logged.
- Camera/microphone are requested only after Call or Accept. Late permissions and
  network responses after cancel cannot revive a call. Local tracks stop on cleanup.

## Verification

`node --test tests/*.test.cjs`, `npm run lint -- --quiet`, and `npm run build`.
`tests/video-database.sql` performs rollback-only authorization, device ownership,
idempotency, expiry, and order-completion assertions on the deployed function.
Client lifecycle tests use fake media/transport; they do not verify physical media.
Android: `./gradlew testDebugUnitTest lintDebug assembleDebug` with JDK 17 and SDK 36.

The security advisor's `RLS Enabled No Policy` info for `achilt_private.video_calls`
is intentional deny-all client access; only the restricted server function works.
See [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Existing PostGIS/public-extension and Supabase Auth advisories are outside this change.
