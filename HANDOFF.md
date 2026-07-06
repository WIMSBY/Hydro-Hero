# Handoff — 2026-07-06 PM (Chanda → next session)

## TL;DR

**v1.1.2 / Build 39 is APPROVED and live on the App Store** with the one-off logging OTA on top (commit `f74bcb6`). **Android Phase 0 is COMPLETE** as of this afternoon: service account created + wired to Play Console and RevenueCat, SHA-256 key submitted (in review), and a replacement dev build is in the EAS queue after the first one failed on a broken library stub (fixed in commit `58edf1c` — **not yet pushed**).

## Where things are

- **Live on App Store:** Build 39, v1.1.2 (approved 2026-07-06 or earlier)
- **Live OTA on production channel:** one-off logging, update group `10c2a4bf-db0a-4c92-b245-0c5bcd6ecb5c` (published 2026-07-06)
- **Prior OTA still relevant:** ScrollPicker off-by-one fix (2026-07-04, both v1.1.1 + v1.1.2 channels)
- **Android port:** Phase 0 DONE. Dev build `fe0d2a51-1a69-41a8-a196-9b9d0575f231` was IN_PROGRESS at session end — check with `npx eas-cli build:view fe0d2a51-1a69-41a8-a196-9b9d0575f231 --json`. If FINISHED → download APK → install on Pixel 7 emulator → Phase 2 smoke test.

**Branch:** `main` at `58edf1c` — 1 commit ahead of origin (push not yet authorized).

## Android session notes (2026-07-06 PM)

- First dev build `77488959` ERRORED: `react-native-watch-connectivity@2.0.0` ships a broken Android Kotlin stub. Fix in `58edf1c`: `react-native.config.js` excludes it from Android autolinking; `utils/WatchManager.ts` requires it only on iOS.
- Play Console's "API access" page no longer exists. New flow (completed): GCP project `hydro-hero-501622` → enabled Google Play Android Developer API → service account `hydro-hero-eas-submit@hydro-hero-501622.iam.gserviceaccount.com` → JSON key saved as `pc-api-key.json` at repo root (gitignored) → invited via Play Console Users and permissions (financial, orders, drafts, store presence, release-to-tracks).
- Same JSON uploaded to RevenueCat (Play Store app). RC's "Could not validate access to Google Play subscription purchases" warning = Google permission propagation, self-clears within ~36h.
- SHA-256: EAS keystore fingerprint added in Android Developer Verification console (a different auto-synced key `F5:ED:41:A6:2...` was already Verified). Status "being reviewed" — confirm it flips to Verified.

## What shipped today: one-off drink logging (JS-only, single file `app/(tabs)/index.tsx`)

Free path to log a beverage that isn't on the home-screen grid — conversion bet: repeated one-off use of a Pro-locked beverage sells the "add it to your home screen" upgrade.

- **"Log once" button** on every *unselected* row in the Customize Your Beverages sheet (all users, free + Pro). Locked rows keep dimmed content + paywall-on-row-tap; the button stays full-opacity and free.
- Tapping it closes the sheet, waits 350 ms (iOS Modal-over-Modal landmine), then opens a **one-off amount modal** (light theme per design tokens: navy header, gold title). Quick-add chips + custom amount in preferred unit → **Log It**.
- Logging runs the normal pipeline via a new optional param: `handleBet(oz, categoryOverride?)`. The grid (`selectedBeverages`) is never touched.
- **PRO nudge:** 3rd one-off log of the same beverage, only if `!isPro && !DEFAULT_VISIBLE_BEVS.includes(cat)` → one-time-per-beverage-per-profile Alert → "See PRO" opens paywall. Storage keys (profile-namespaced): `oneoff_log_count_<bev>`, `oneoff_nudge_shown_<bev>`. Free defaults (incl. Soda) never nudge; Pro users never nudge.

### Discovered during this work

The old **"What did you drink?" category-picker Modal** (`index.tsx` ~line 5300, `showCategoryModal`) is dead code — `setShowCategoryModal(true)` is never called anywhere. Pre-Build-25 leftover. Candidate for deletion in a cleanup pass.

## If something goes sideways with the OTA

- JS-only fix → patch on `main`, `npx eas update --branch production --platform ios` (ALWAYS `--platform ios` — web export crashes on expo-secure-store SSR).
- Roll back = republish the previous update group from the EAS dashboard.

## Post-approval parking lot

- **Android Phase 2** — smoke-test the dev build APK on the Pixel 7 emulator (golden path + layout audit sites listed in `project_android_port.md`).
- **Push `58edf1c`** to origin once authorized.
- **Screenshot refresh** — ASC screenshots still show pre-refresh modal palette. Not a rejection risk.
- **Siri onboarding** — contextual tip after first preset save. Deferred.
- **Dead code cleanup** — the unreachable "What did you drink?" modal.
- **EAS Build migration (iOS)** — `eas.json` production block missing `SENTRY_AUTH_TOKEN` + `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.

## Pointers

- Feature details: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/project_oneoff_logging.md`
- Pro-gate map (now includes the free Log-once bypass on gate #1): `memory/project_pro_gate_map.md`
- Quick state catch-up: `memory/MEMORY.md` (auto-loaded)
- Archive landmines (if a new binary is ever needed): `feedback_prebuild_wipes_xcode_env_local.md` + `feedback_local_archive_buildnumber.md` + `feedback_prebuild_needs_clean.md`
- TestFlight + ASC dashboard links: `reference_external_dashboards.md`
