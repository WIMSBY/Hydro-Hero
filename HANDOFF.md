# Handoff — 2026-07-06 (Chanda → next session)

## TL;DR

**v1.1.2 / Build 39 is APPROVED and live on the App Store.** On top of it, the **one-off drink logging feature** shipped today as an OTA to the production channel (runtime 1.1.2) — commit `f74bcb6`, pushed to `origin/main`. Working tree is clean.

## Where things are

- **Live on App Store:** Build 39, v1.1.2 (approved 2026-07-06 or earlier)
- **Live OTA on production channel:** one-off logging, update group `10c2a4bf-db0a-4c92-b245-0c5bcd6ecb5c` (published 2026-07-06)
- **Prior OTA still relevant:** ScrollPicker off-by-one fix (2026-07-04, both v1.1.1 + v1.1.2 channels)
- **Android port:** Phase 0/1 in flight — see `~/.claude/.../memory/project_android_port.md` + `project_handoff_2026_07_04.md` for the EAS dev build ID, SHA-256 verification steps, and Play Console API-access unlock checklist

**Branch:** `main` at `f74bcb6`.

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

- **Android port next steps** — check EAS dev build, SHA-256 → Play Console developer verification, service-account walk-through (user wants one screen at a time). Full checklist in `project_handoff_2026_07_04.md`.
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
