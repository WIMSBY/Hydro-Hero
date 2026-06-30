# Handoff — 2026-06-29 evening (Chanda → next session)

## TL;DR

**Build 35 / v1.1.0 is prepped and waiting on Chanda's archive tap.** Eight commits of UX polish, sound design, and Squad cleanup pushed today — all OTA'd to existing Build 34 testers and baked into the Build 35 embedded bundle so App Review's first launch matches what testers already have.

Xcode workspace is open. Working tree is clean. `tsc --noEmit` is green. Just hit Product → Archive.

## Where we are

**Branch:** `2026-06-19-bdv9` — pushed to origin.

**Latest commits on top of `4624209` (Build 34 archive):**
1. `bbe3e70` Squad: tap header to edit active profile; pencil only when unnamed
2. `bd38f2e` Squad: add-from-family flow + drop redundant Invite button *(neutralized later)*
3. `3d539d8` Squad: restore Invite to Squad button on active profile card
4. `8065f62` Missions: clearer shield explainer in detail modal
5. `40afd85` **Build 35: bump buildNumber for archive**
6. `21bed87` Squad: hide Cheer/Request on self-profile cards *(reverted)*
7. `521ae48` Squad: replace Add From Family with read-only Family At A Glance
8. `fa185e4` Squad: drop stale self-profile members from squad_members on load
9. `b76668e` Home: swap Other Amount above Customize-Your-Quick-Add upsell
10. `7dd7885` Catalog: replace legacy fruit/energyshot keys (tsc cleanup)
11. `87f687c` Sounds: new jackpot fanfare + scifi droplet; resequence goal celebration

(Commits 2 + 6 were tried and walked back — final tree is clean. Squad lost a brief Add-From-Family interactive section in favor of a read-only Family At A Glance summary; same-device "squad members" muddied the friends-on-other-devices model.)

## Archive checklist (Chanda picks up here)

Prep already done:
- ✅ `app.json` ios.buildNumber `34 → 35` (commit `40afd85`)
- ✅ `npx expo prebuild --clean --platform ios` ran clean
- ✅ `ios/.xcode.env.local` re-armed with SENTRY_AUTH_TOKEN + EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
- ✅ `ios/HydroHero/Info.plist` shows 1.1.0 / 35
- ✅ `npx tsc --noEmit` returns clean
- ✅ `ios/HydroHero.xcworkspace` opened
- ✅ Working tree clean

To do:
1. In Xcode: select HydroHero scheme, destination Any iOS Device (arm64), **Product → Archive**
2. Verify HydroHeroWidget signing is green
3. Organizer → Distribute App → App Store Connect → Upload
4. In ASC v1.1.0 page: detach Build 34, attach Build 35
5. Paste in the new description sections + What's New + Promo Text (see §"ASC copy" below)
6. Submit for App Review

If archive surfaces a bug or you change anything: re-archive on same branch, no buildNumber bump needed (Build 35 hasn't shipped to anyone external). If it's already uploaded to ASC, cut Build 36 instead using the same playbook.

## OTAs pushed today (runtime 1.1.0, production, iOS)

Build 34 testers already have all of these:
1. `00bdc168-c109-4ab2-94a9-2eb68564ac64` — Squad header tap-to-edit + pencil-when-empty
2. `129b72a8-bec6-4876-9316-90ca5a31f3b5` — Add-From-Family (later partially superseded)
3. `eb584e0a-9131-4ae0-a044-74b53f3c3364` — restore Invite button
4. `349ea518-4811-4443-8f24-99b9f1d2d91d` — clearer shield explainer
5. `057764d4-f425-4c09-b3f0-2b085e2dba89` — Family At A Glance + drop stale self-added members (one-shot migration)
6. `343e5228-5fb5-46e0-b8da-e85140eb3fe3` — Other Amount above upsell
7. `6ca83868-4872-48c2-a914-a726fb01771d` — new sounds + goal-celebration resequence

## Goal celebration sequence (worth knowing if you tweak)

After today's resequence in `app/(tabs)/index.tsx`:

- `t≈0`: reveal sound, scroll
- `t≈1.2s`: tank fill → droplet + splash sounds (splash no longer skipped on jackpot)
- `t=2500ms`: jackpot fanfare (4s sound) + shake + confetti shown
- `t=3800ms`: confetti hides, GOAL message + celebration card + streak milestone card released
- Jackpot sound continues under the cards — intentional audio bleed, confirmed wanted

`STREAK_DELAY_MS = 3800` in the streak useEffect keeps the streak fanfare in sync.

## ASC copy (paste-ready)

**Add to existing description, after "Satisfying Drink Logging":**

```
Hero Missions
Turn your daily goal into a quest. Four evergreen Mission chains — The Hero's Journey, Tea Time, Hourly Hydration, and Dry Spell — let you earn Hero Sigils, miss-day Shields, and unlock new powers as you complete Bronze, Silver, and Gold tiers.

Live Activity
Keep your tank on your Lock Screen and Dynamic Island so you can check your hydration at a glance. Opt in any time — off by default.

Family Mode
One phone, the whole household. Each family member gets their own profile with their own goal, streak, history, and emoji avatar — and you can see everyone's progress on the Squad tab. Free for 2 profiles, Pro unlocks up to 5. Everything stays local — no cloud, no accounts.
```

Optional in-place edit to existing "Hydrate With Your Squad" line: change "Add friends, share your progress" → "Add friends and family members on other devices, share progress via QR or code".

**What's New in This Version:**

```
v1.1.0 — Missions, Family Mode, and Live Activities

🛡 Missions — Four evergreen mission chains turn your daily goal into a story. Earn Hero Sigils, miss-day Shields, and unlock powers as you complete each tier.

💧 Live Activity — Optional Lock Screen + Dynamic Island droplet that tracks your tank in real time.

👪 Family Mode — Each member gets their own goal, streak, and history. Free for 2 profiles, Pro unlocks 5.

🎯 Squad — Cleaner profile editing and a new Family at a Glance card.

🔊 New sounds — Refreshed jackpot fanfare and a longer goal celebration.

Plus polish across the Home screen, Quick Add, and Missions tab.
```

**Promotional Text — pick one (170 char limit):**

- Playful (138 chars): "v1.1.0: Live Activities, multi-profile Family Mode, and four Mission chains that turn your daily goal into an epic quest. Hydrate like a hero."
- Direct (152 chars): "Massive update — Missions, Family Mode for the whole household, Live Activities, and a goal celebration worthy of the name. Pour something and tap in."
- Benefit-first (140 chars): "Track everyone's hydration in one app. New: Missions, Family profiles, Live Activities, and a sweeter goal-hit celebration to look forward to."

**Reviewer Notes:**

```
Build 35 = v1.1.0 polish refresh on the v1.1.0 features. No new IAPs, no new permissions, no new Info.plist usage descriptions. Bug fixes + UX improvements to Squad, Missions, Home celebration sequence.
```

## Screenshots

iPhone 6.5" slot (1242 × 2688, iPhone 11 Pro Max sim) may want a refresh — Squad has the new Family At A Glance section, and the Missions detail modal has the clearer shield copy. Sim is already booted on iPhone 11 Pro Max with Build 35 dev install if you want fresh captures.

iPad screenshots left as-is per prior decision.

## If review comes back with feedback

- **JS-level fix possible** → patch on `2026-06-19-bdv9`, `npx eas update --branch production --platform ios --message "..."`, no new binary needed. Existing installs pick it up; reviewer reinstall sees the embedded bundle though, so for first-launch blockers cut a new binary.
- **Native or first-launch blocker** → bump buildNumber to 36, repeat archive checklist. Same playbook, same landmines (`prebuild --clean` wipes `.xcode.env.local` — re-append from `.env.local`).
- **Rejection categories that have hit us before**:
  - 2.1(b) unresponsive subscribe button — Build 21 fix (defer openPaywall after modal close)
  - 5.1.1(iv) camera pre-prompt — Build 20 fix (Grant Camera Access / Continue / Open Settings flow). Not touched today; if reviewer claims it changed, double-check.
  - First-launch freeze — Build 33 → 34 fix (Modal-over-Modal in profile editor). Sim-tested clean for Build 35.

## Pointers

- Latest state: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/project_build35_session_2026_06_29.md` (auto-loaded — also has the full ASC copy block)
- Canonical Build 35 diff: `project_build35_contents.md`
- Quick state catch-up: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/MEMORY.md` (auto-loaded)
- Archive landmines: `feedback_prebuild_wipes_xcode_env_local.md` + `feedback_local_archive_buildnumber.md` + `feedback_prebuild_needs_clean.md`
- TestFlight + ASC dashboard links: `reference_external_dashboards.md`
- Tester device: Chanda's iPhone 15 Pro UDID `00008130-000425883E40001C` (Developer Mode ON)
