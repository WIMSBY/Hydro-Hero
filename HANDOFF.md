# Handoff — 2026-06-27 evening (Chanda → work → next session)

## TL;DR

**Build 33 Day 5 is committed and pushed.** Rewards plumbing landed: SigilCase grid on Missions tab, Iron Will +1 shield at every startMission call site, MissionCompleteCard celebration on Home queued from the engine eval, plus a small RevenueCat dev-warning fix.

**What's left before archive:** Family Mode (multi-profile feature with avatar pill, emoji picker, Welcome modal, free 2 / Pro 5 paywall hook). Scope is ~2-3 days. Spec is locked.

Build 32 still in TestFlight beta review last we knew. Don't archive Build 33 until Family Mode lands.

## Where we are

**Branch:** `2026-06-19-bdv9` — pushed to origin.

**Latest commits on top of `2f3a0a6` (Build 34 Day 4 + Hourly Hydration):**
- `<HEAD>` — Build 34 Day 5: rewards plumbing + RC anonymous-logOut fix

(Commit messages say "Build 34" because the Missions feature was originally planned as Build 34; the actual binary is Build 33 / v1.1.0 combining LA + Missions + Family Mode.)

**Day 5 deliverables, all shipped to branch:**
1. `utils/Rewards.ts` — `getUnlockedRewards(progresses)`, `hasPower(progresses, id)`, `startMissionWithPowers(id, progresses, today)` (Iron Will wraps the engine call), `getSigilTeases`, `newlyCompletedMissions` diff helper. Scaffold comments noting other powers as deferred.
2. `components/SigilCase.tsx` — collapsible grid on Missions tab between MissionsSection and TrophyCase. Shows earned + locked sigils/powers/cosmetics + "Next reward" tease.
3. Iron Will wired at all three startMission call sites: Home auto-start (`index.tsx`), Missions tab auto-start (`badges.tsx`), MissionsSection.handleStart (`MissionsSection.tsx`).
4. MissionCompleteCard on Home — gold-glow card with mission emblem + reward readout, plays `playJackpotSound`. Queued from `evaluateAllActive`'s `changed` array; multiple same-night completions queue and show one at a time.
5. Small dev-warning fix in `resetProForTesting`: check RC `getAppUserID()` for the `$RCAnonymousID:` prefix before calling `logOut()` to suppress RevenueCat's noisy "LogOut was called but the current user is anonymous" LogBox redbox.

## What's NOT in Build 33 yet (Family Mode work — start here when you return)

Full spec: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/project_family_mode_spec.md` (auto-loaded). Locked product decisions:

- **Switch UX:** Avatar pill in Home header (top-right). Tap → bottom sheet with profile rows + "+ Add Profile" footer. Long-press a row → edit/delete.
- **Identity:** Name + emoji-avatar picker (🦊🐼🦁🦄🐢🦋🐙🐝🐳🐶🐱🦉🦒🦝🐧) + existing 5 Hero emblems.
- **Pro gating:** Free = 2 profiles, Pro = 5. 3rd profile add triggers paywall. Slots 3-5 render visible-but-locked per [[feedback-pro-features-tease-dont-hide]].
- **Hero name = single source of truth.** Editing Hero name in HeroSetupModal updates: Family profile name AND Squad display name. Kill the standalone Squad display-name input.
- **Migration:** On first launch of Build 33: existing Hero data becomes Profile 1 (auto-create). Show a one-time "Meet Family Mode" welcome modal. If only legacy Squad name exists (no Hero), copy it to Hero in a one-shot migration.
- **Pro entitlement is account-level** (RC). Buying Pro on any profile unlocks Pro everywhere — there's no per-profile Pro state.

**What needs namespacing (`<profileId>:<key>` in AsyncStorage):**
drink log, water history, daily goal, streak, Hero name/emblem, missions catalog progress, hero shields, hourBuckets snapshot, custom presets, unit (oz/ml), body metrics, reveal/last-drink state, hourly-hydration eval cursor, LA opt-in state.

**Shared / account-level (do NOT namespace):**
RC entitlement, custom recorded sounds, sound pack selection, notification toggles, theme, Sentry user.

**Engine impact:** `performDailyReset` and `evaluateAllActive` should eval ALL profiles on app foreground (not just active) so streaks stay honest on inactive profiles at midnight rollover.

**LA impact:** Live Activity is tied to active profile. Switching profile ends current LA and starts a new one for the new profile (if it has LA enabled).

## First thing when you return

1. Check today's overnight engine eval. If Origin Story progress moved from `Day 0/7 → Day 1/7` (assuming you hit goal today on Chanda's test device), the catchUp + midnight rollover plumbing worked end-to-end. If it didn't move, that's a Day 5 bug to chase before Family Mode.
2. Verify SigilCase renders on the Missions tab visually. Day 5 was verified at bundle level (Metro compiled clean, 8757 modules, zero errors), but cliclick couldn't drive into the Sim due to a host-side Accessibility permission gap. To unblock visual verification: System Settings → Privacy & Security → Accessibility → toggle on the terminal running Claude Code. Then I can drive the UI and screenshot SigilCase directly.
3. Start Family Mode Day 1: data layer refactor.

## Family Mode rough sequencing

**Day 1 (data layer):**
- New `utils/ProfileStore.ts` — Profile type, `profiles` array, `activeProfileId`, `getActiveProfileId()`, `setActiveProfile()`, `addProfile()`, `deleteProfile()`, `listProfiles()`.
- Define `prefixKey(key)` helper that namespaces an AsyncStorage key with the active profile ID.
- One-shot migration: on app boot, if `profiles` is missing, create Profile 1 from existing Hero data and rename old keys to `<id>:<key>`.

**Day 2 (UI):**
- Avatar pill component on Home header.
- ProfileSwitcherSheet (bottom sheet with rows + "+ Add Profile").
- ProfileEditorModal (name input + emoji-avatar picker grid).
- Welcome modal on first launch of Build 33.

**Day 3 (integration):**
- Refactor all profile-scoped AsyncStorage reads/writes through `prefixKey`.
- Engine eval updated to iterate all profiles on foreground.
- Live Activity end-and-restart on profile switch.
- Squad page: remove standalone display-name input, source from active profile's Hero name.
- Free 2 / Pro 5 paywall hook on profile add.

## Archive checklist (after Family Mode lands)

Per project memory landmines:

```bash
# 1. Bump app.json: version "1.1.0", ios.buildNumber "33"
# 2. Run prebuild --clean (the ONLY way local Xcode archive respects the buildNumber bump)
npx expo prebuild --clean

# 3. Re-add Sentry + RC keys to ios/.xcode.env.local (wiped by --clean)
cat >> ios/.xcode.env.local <<EOF
export SENTRY_AUTH_TOKEN=<from .env.local>
export EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=<from .env.local>
EOF

# 4. Open in Xcode
open ios/HydroHero.xcworkspace

# 5. Verify HydroHeroWidget signing is still green
# 6. Product → Archive → distribute to App Store Connect
# 7. In ASC: attach to v1.1.0, write Reviewer Notes + What's New, submit for TF beta review
```

## Reviewer Notes (when you submit)

- New feature: Live Activities (opt-in Lock Screen + Dynamic Island tank droplet)
- New feature: Missions (4 evergreen chains, fully local, no new permissions)
- New feature: Family Mode (multi-profile, fully local, no new permissions, no cloud)
- Tab renamed Badges → Missions (same route, same icon)
- No new IAPs
- No new permissions or Info.plist usage descriptions

## In case anything broke overnight

- Sentry triage same as before (HYDRO-HERO-9 wrap, HYDRO-HERO-6 dev-only, etc.) — see `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/project_handoff_2026_06_22.md`
- The OTA channel-name issue from Build 24-26 is already fixed in app.json — Build 33's local archive will ship with the channel header.
- If Live Activity doesn't render on a tester's device: usually means iOS-level Live Activities were disabled. The opt-in chip's onPress already handles the DISABLED error path with an alert.

## Not in scope until Build 34+

- Custom mission editor (Pro headline for Build 34)
- Sixth Sense adaptive reminders implementation (toggle only after Dry Spell Silver completion)
- Hydro Vision custom widget skin
- Time Warp freeze-streak pass
- Squad Beacon animated share card
- Per-profile notification names ("Hey [profile name], drink up!")

## Pointers

- Quick state catch-up: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/MEMORY.md` (auto-loaded)
- Family Mode spec: `project_family_mode_spec.md`
- Pro-gate map (every gated surface): `project_pro_gate_map.md`
- "Tease, don't hide" feedback: `feedback_pro_features_tease_dont_hide.md`
- Build process landmines: `feedback_local_archive_*.md` + `feedback_apple_targets_filename.md`
- Sentry token + RC key: `.env.local` (and re-paste into `ios/.xcode.env.local` after prebuild --clean)
- TestFlight + ASC dashboard links: `reference_external_dashboards.md`
- Tester device: Chanda's iPhone 15 Pro UDID `00008130-000425883E40001C` (Developer Mode ON)
