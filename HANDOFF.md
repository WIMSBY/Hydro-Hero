# Handoff — 2026-07-29 late night (Chanda → next session)

## TL;DR

**Three Android-only OTAs shipped tonight** to Closed Testing 1.1.3, all on runtime 1.1.3 / branch production. No native code changed, no new AAB uploaded.

- `9773698` — Missions + Settings polish (Origin Story auto-restart, Hourly Hydration display, Settings safe-area)
- `af9982a` — Tank oz sync + drag reorder in Customize modal
- `1379857` — Badge modal desc wraps on Samsung/One UI

**Only 5 / 12 testers have opted in.** The 14-day active-tester clock only ticks per opted-in tester, so production submission is still gated. Dylan is considering an LLC-owned Google Play developer account (org accounts bypass the personal-account 12/14 rule) — Chanda is consulting him next.

**Deferred to next session (bundled with iOS rebuild):**
1. Alcohol handling redesign — likely negative `eff` values for the four alcoholic categories
2. Tank ↔ DrinkLog math unification (currently 15.6 vs 15.7 for 2× 8oz coffee)

Both changes touch how hydration accumulates and warrant a real EAS build to test properly, so they're deliberately bundled with the next binary submission.

## Where things are

- **iOS App Store LIVE:** v1.1.2 Build 39 (v1.1.3 Build 41 status still unknown from 07-06 handoff)
- **Android Closed Testing LIVE:** v1.1.3 / commit lineage `9773698` (via OTA on top of the 07-08 AAB `6ad744b6`)
- **Tester opt-ins:** 5 / 12 (need more for 14-day clock)
- **Branch:** `main` — clean at session end, all pushed to origin

## Blockers → sequence to unblock

1. **More tester opt-ins OR LLC path decision.** Chanda + Dylan chat is next.
2. **If LLC path chosen:** ~3-5 weeks for LLC formation → Google Play org account signup with DUNS/tax → verification → app transfer OR republish under new package name (loses install continuity for the 5 current testers).
3. **If tester path stays:** recruit 7+ more Android device owners willing to install + opt in + not uninstall for 14 days.

## Parallel work while waiting

**Next dev session — alcohol + math (bundled EAS build):**
- **Alcohol redesign** — decision pending from Dylan. Recommended plan: flip `eff` for Beer/Wine/Cocktail/Spirits negative (~-0.3 / -0.6 / -0.5 / -1.0), floor tank at 0, keep CONSUMED counting, add "-X%" indicator on alcohol tiles, no retroactive recompute on toggle flip. Alternative: gate behind a "Realistic Alcohol Math" setting. Do NOT remove alcohol entirely — that would kill the whole Dry Spell mission chain.
- **Tank math unification** — in `app/(tabs)/index.tsx`, switch the hydration accumulator to store raw `oz × eff` at 2-decimal precision (round only at display). Touches `addWater` (line 4030), `setDisplayedHydration` accumulators (lines 3109, 3618, 4231), the undo path (line 4313), and `lastEntryHydratedOz` storage. AsyncStorage precision migration should be seamless (existing rounded values just become the starting float).
- **Bundle these into one EAS build**, submit to both stores, iterate.

## Config landmines carrying over

- **`react-native-watch-connectivity` Android autolinking exclusion** (`react-native.config.js`, commit `58edf1c`) — production Android build depends on it. If a fresh `eas build -p android` errors on `compileDebugKotlin`, the fix got reverted.
- **`pc-api-key.json`** at repo root is gitignored and required by `eas submit -p android`.
- **iOS archive landmines** unchanged for any hotfix build: `feedback_prebuild_wipes_xcode_env_local.md`, `feedback_local_archive_buildnumber.md`, `feedback_local_archive_runtime_version.md`, `feedback_local_archive_ota_channel.md`.
- **RN Modal on Android requires its own `GestureHandlerRootView`** — the app-root one at `app/_layout.tsx:70` does not reach into modal windows. Any new Android modal that uses gesture-handler-powered components (DraggableFlatList, ScrollView with panners, etc.) needs its own wrap. Precedent: `app/(tabs)/index.tsx:1418`.
- **On Android, RN `Modal presentationStyle="pageSheet"` is ignored** — the modal renders full-screen and its top content sits under the status bar. Wrap header in `SafeAreaView edges={['top']}` from `react-native-safe-area-context`. Precedent: Settings modal in `app/(tabs)/index.tsx:6009`.

## Session commits

- `9773698` Missions + Settings polish
- `af9982a` Android polish: tank oz + drag reorder in modal
- `1379857` Android: badge modal desc wraps on Samsung/One UI

All three shipped as OTAs to production/android/runtime=1.1.3 tonight. Dashboards linked in `memory/project_handoff_2026_07_29.md`.

## Parking lot

- **Sound pack preview for Classic** — currently plays reveal tone (falling 880→660Hz), not the water_log tone. Left as-is per user decision this session; revisit if user reverses.
- **Alcohol negative-eff UI treatment** — do we show "-X%" on the tile? Show a small drop-icon-with-slash?
- **In-tab refresh trigger for Hourly Hydration progress** — currently only refreshes on tab focus. If user logs a drink while already on Missions tab, hours count doesn't tick until swipe-out-and-back.
- Everything from the 07-14 parking lot still applies (iOS Build 41 status, SKU ID alignment, etc.).

## Pointers

- Tonight's session state: `memory/project_handoff_2026_07_29.md`
- Prior handoff (07-14 Closed Testing rollout): `memory/project_handoff_2026_07_14.md`
- Play 12/14 rule: `memory/feedback_play_personal_account_12_14_rule.md`
- Android UI landmines: `memory/feedback_android_ui_landmines.md`
- Quick state catch-up: `memory/MEMORY.md` (auto-loaded)
