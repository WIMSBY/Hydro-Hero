# Handoff — 2026-07-02 afternoon (Chanda → next session)

## TL;DR

**Build 38 / v1.1.2 is submitted for App Review.** Single-fix release on top of the currently-live v1.1.1 (which Apple approved same-day as Build 37 was submitted). Fix: the watch-side WCSession handler now calls `HydroHeroAppShortcuts.updateAppShortcutParameters()` immediately after writing `siri_catalog`, so watchOS re-indexes Siri's LogPreset phrase grammar and "Hey Siri, log preset [name] in Hydro Hero" on the wrist actually resolves to real preset names.

Working tree is clean. Branch `2026-06-19-bdv9` pushed. Main is caught up.

## Where things are

- **In review:** Build 38, v1.1.2, submitted 2026-07-02 afternoon
- **Live on App Store:** Build 37, v1.1.1 (approved 2026-07-02 early)
- **Orphans in ASC Builds pool:** Build 36 (uploaded but never attached) — harmless

**Branch:** `2026-06-19-bdv9`. Build 38 commit is `b9f3cd4`.

## What Build 38 actually changed

One 7-line diff in one file:

```swift
// targets/watch/WatchConnectivityManager.swift
import WatchConnectivity
import SwiftUI
import AppIntents   // ← added

// inside applyContext, after UserDefaults.standard.set(presets, forKey: "siri_catalog"):
if #available(watchOS 9.0, *) {
    HydroHeroAppShortcuts.updateAppShortcutParameters()
}
```

Mirrors the iPhone-side call at `ios/LLSiriQueue.swift:33`. That's it — no other files changed on the tracked side. The `ios/` bumps (Info.plist `CFBundleVersion 38` / `CFBundleShortVersionString 1.1.2`, pbxproj `CURRENT_PROJECT_VERSION 38` 4× / `MARKETING_VERSION 1.1.2` 6×) are in the working tree but gitignored.

## Diagnosis path (for future watch-Siri bugs)

The watch had all the right pieces from Build 36's Siri LogPreset landing:
- `HydroHeroAppShortcuts` declares LogPreset with `"Log preset (.$preset) in Hydro Hero"` phrase
- `PresetEntityQuery.suggestedEntities()` reads `UserDefaults.standard[siri_catalog]`
- `WatchConnectivityManager.applyContext` populates that catalog from phone WCSession pushes
- Compiled `Metadata.appintents` (inspected via `strings HydroHeroWatch.app/Metadata.appintents/extract.actionsdata`) correctly registers the intent, entity, query, and phrases

But there was never a call to tell watchOS "the entity list changed, please re-query." The phone side has always had that call in `LLSiriQueue.writeCatalog`. Watch was missing the mirror.

## Verification landmines during this session

- **watchOS simulator has no `linkd` daemon** — `updateAppShortcutParameters()` fails with "Failed to connect to linkd" in the sim, so watch-Siri fixes can't be end-to-end verified there. Real Apple Watch install required. Log-scrape verification (grep `subsystem == "com.apple.AppIntents"` for the linkd error) at least confirms the API call is reached. Documented in `feedback_watchos_sim_no_linkd.md`.
- **Workspace build fails on `watchsimulator` SDK** with expo-dev-menu-interface errors. Use `xcodebuild -project HydroHero.xcodeproj -target HydroHeroWatch -sdk watchsimulator` to skip Pods when compile-checking the watch target only.

## ASC copy shipped

**What's New (v1.1.2):**
```
v1.1.2 — Apple Watch Siri fix

Fixed: "Hey Siri, log preset [name] in Hydro Hero" on Apple Watch
now recognizes your saved presets. In v1.1.1 the Watch's Siri
wasn't refreshing its preset list after new presets synced over
from the phone, so voice invocation could return "no matching
preset" even when the preset existed. Now the Watch re-indexes
automatically.
```

**Reviewer Notes:** references `HydroHeroAppShortcuts.updateAppShortcutParameters()` mirror of `LLSiriQueue.writeCatalog`. Explicitly states no new permissions / IAPs / Info.plist / UI changes and same runtime version policy.

**Promo text + Description add-on:** reused verbatim from v1.1.1 — the Siri-on-Watch pitch is still accurate, it just actually works now.

## If review comes back with feedback

- **JS-only fix possible** → patch on `2026-06-19-bdv9`, `npx eas update --branch production --platform ios`. No new binary.
- **Native or first-launch blocker** → bump buildNumber to 39, same archive checklist. But note v1.1.2 train stays open until Apple approves — one more build in the same train is fine.

## Post-approval parking lot (unchanged from v1.1.1 handoff)

- **Screenshot refresh** — ASC screenshots still show pre-refresh modal palette. Not a rejection risk.
- **Siri onboarding** — contextual tip after first preset save + Settings > Voice Shortcuts section. Deferred.
- **EAS Build migration** — `eas.json` production block missing `SENTRY_AUTH_TOKEN` + `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`. ~1h setup + verification if we want to move off local Xcode.

## Pointers

- Latest build state: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/project_build38_contents.md` (auto-loaded)
- Prev shipping build: `project_build37_contents.md`
- Quick state catch-up: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/MEMORY.md` (auto-loaded)
- Watch-sim gotcha: `feedback_watchos_sim_no_linkd.md`
- Archive landmines: `feedback_prebuild_wipes_xcode_env_local.md` + `feedback_local_archive_buildnumber.md` + `feedback_prebuild_needs_clean.md`
- TestFlight + ASC dashboard links: `reference_external_dashboards.md`
