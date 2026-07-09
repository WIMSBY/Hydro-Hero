# Handoff — 2026-07-08 PM (Chanda → next session)

## TL;DR

**Internal testing track is LIVE on Play Console.** Release 1.1.3 (versionCode 1), commit `ede1ecf`, EAS build `6ad744b6-7e38-4cbd-adc1-7f9e31a33787`, rolled out 6:40 PM.

**Blocked on two Google-side clocks** before the paywall works end-to-end:
1. **App content review** — Chanda submitted the App content forms tonight (Data safety, etc.); waiting on Google review (typically hours). Until this clears, tester install returns "Item not found" on the phone.
2. **Google Payments merchant account micro-deposits** — profile submitted tonight; Google will send 2 small deposits to Dylan's bank in 1-3 business days for verification. Merchant account must be Verified before Play IAP products can be created, which blocks the paywall.

**Absolute fastest realistic ship date: ~3 weeks from 2026-07-08** — dominated by Google's 12-testers × 14-days Closed testing requirement for personal developer accounts (see [[feedback-play-personal-account-12-14-rule]]).

## Where things are

- **iOS App Store LIVE:** v1.1.2 Build 39 (v1.1.3 Build 41 status unknown — check ASC this session)
- **Android Internal testing LIVE:** v1.1.3 / versionCode 1 / build `6ad744b6` / commit `ede1ecf`
- **Android SHA-256:** both fingerprints Verified in Play Console → Android developer verification (checked 2026-07-08)
- **Play merchant account:** submitted, awaiting micro-deposit verification (Dylan's bank)
- **App content review:** submitted 2026-07-08 evening, in review
- **Internal testers list:** Chanda + Dylan added; opt-in link retrievable from Play Console → Testing → Internal testing → Testers tab
- **Branch:** `main` — clean at session end (only HANDOFF.md itself modified)

## Blockers → sequence to unblock

1. **Wait for App content review to clear** (hours) → check Play Store on phone every 15-30 min; when the direct URL `https://play.google.com/store/apps/details?id=com.wimsby.hydrationstation` returns an install page instead of 404, tester install works.
2. **Wait for micro-deposits to land** (1-3 business days) → go back to Payments profile → enter the two exact deposit amounts → merchant account becomes Verified.
3. **Create Play IAP products** (Monetize → Products → Subscriptions + In-app products): Monthly subscription $1.99 + Lifetime one-time $9.99 (mirror iOS SKUs by ID where possible for RC alignment).
4. **Wire RC Android offerings** — RC dashboard → Products tab attaches the new Play SKUs (may need up to 15 min sync); then Offerings tab adds packages.
5. **Self-verify paywall on Chanda's phone** — install Internal build, tap Upgrade, confirm both products render with correct prices, complete a test purchase (Play test accounts get free real purchases while in Internal).
6. **Create Closed testing track**, upload same AAB, invite 12+ testers → this starts the 14-day active-testing clock.
7. **After 14 days + Google verifies active-tester metric** → promote to production.

## Parallel work Chanda can do while waiting

- **Recruit 15-20 closed testers with Android phones + gmail addresses.** Aim for 15-20 yeses to comfortably clear 12 active over 14 days. This is the real-world gating factor — engineering is mostly done or blocked on Google.
- **Draft the tester welcome email** — full draft is in this session's transcript (in memory too if needed). Not sending until App content review clears.

## Config landmines carrying over

- **`react-native-watch-connectivity` Android autolinking exclusion** (`react-native.config.js`, commit `58edf1c`) — production Android build depends on it. If a fresh `eas build -p android` errors on `compileDebugKotlin`, the fix got reverted.
- **`pc-api-key.json`** at repo root is gitignored and required by `eas submit -p android`. Don't move or rename. Regenerate from GCP → service account `hydro-hero-eas-submit@hydro-hero-501622.iam.gserviceaccount.com`.
- **EAS production Android profile** = `buildType: "app-bundle"` (AAB). Dev/preview = APK.
- **Merchant account must match developer account owner = Dylan.** Chanda can fill the form but Dylan's legal name / SSN / bank must go on it. See [[feedback-play-merchant-owner-match]].
- **iOS archive landmines** unchanged for any hotfix build: `feedback_prebuild_wipes_xcode_env_local.md`, `feedback_local_archive_buildnumber.md`, `feedback_local_archive_runtime_version.md`, `feedback_local_archive_ota_channel.md`.

## Task checklist snapshot

Full task tracker from tonight's session:

- [x] Verify Android Developer SHA-256 status
- [x] Build production AAB via EAS
- [x] Create Internal testing track in Play Console
- [x] Submit AAB to Internal testing track
- [x] Add tester email list in Play Console
- [ ] Opt in as tester + verify Play Store install works — **blocked on App content review**
- [ ] Set up Play in-app products (monthly + lifetime) — **blocked on merchant account**
- [ ] Send tester welcome email + opt-in link
- [ ] Configure RevenueCat Android offerings — **blocked on Play IAP products**
- [ ] Create Closed testing track + recruit 12+ testers — start recruiting NOW
- [ ] Verify Play micro-deposits when they land (1-3 business days)
- [ ] Recruit 15-20 closed testers with Android devices
- [ ] Promote to production after 14-day closed test window

## Parking lot

- iOS Build 41 v1.1.3 status in ASC — was mid-fill end of 07-06.
- Android SKU IDs need to mirror iOS ones for RC to unify (check ASC subscription IDs before creating in Play).
- iOS screenshot refresh — ASC screenshots still show pre-refresh modal palette (cosmetic).
- Siri onboarding tip after first preset save.
- Dead code cleanup: unreachable "What did you drink?" modal.
- EAS Build migration for iOS: `eas.json` production block still missing `SENTRY_AUTH_TOKEN` + `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.

## Pointers

- Tonight's session state (Internal testing rollout, blockers): `memory/project_handoff_2026_07_08.md`
- Play Console main store listing (assets, copy, gotchas): `memory/project_play_store_listing.md`
- Android port phase state (Phase 2 smoke test details): `memory/project_android_port.md`
- Prior handoff (Play listing done, pre-testing): `memory/project_handoff_2026_07_06.md`
- Play 12/14 rule: `memory/feedback_play_personal_account_12_14_rule.md`
- Merchant owner-match rule: `memory/feedback_play_merchant_owner_match.md`
- Quick state catch-up: `memory/MEMORY.md` (auto-loaded)
