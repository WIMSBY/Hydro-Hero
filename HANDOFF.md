# Handoff — 2026-07-02 early morning (Chanda → next session)

## TL;DR

**Build 37 / v1.1.1 is submitted for App Review.** Archived + uploaded + attached to v1.1.1 in ASC, promo text / What's New / Reviewer Notes / description add-on all pasted in, Submit for Review clicked ~5:15 AM 2026-07-02.

Standout feature is still Siri LogPreset on Apple Watch (from Build 36's plan), but Build 37 adds two JS-level refinements on top: the Set Daily Goal Suggested-tab scroll fix and a full modal design refresh (navy hero header + gold title + gold-outlined navy CTAs across every light modal).

Working tree is clean. Branch is `2026-06-19-bdv9`, in sync with origin. Main is caught up.

## Where things are

**In review:** Build 37, v1.1.1, submitted 2026-07-02 ~5:15 AM
**Live on App Store:** v1.1.0 (approved 2026-06-30, Build 35)
**Orphan in ASC pool:** Build 36 — uploaded but never attached, harmless

**Branch:** `2026-06-19-bdv9`, all commits pushed. Main is merged and pushed too.

**Recent commits on top of Build 36's upload state (`c5d77ed`):**
1. `884f07d` Set Daily Goal: scroll body so Suggested tab buttons stay reachable
2. `b6b4fff` Modals: navy hero header + gold title across every light modal
3. `e0dd555` Bump version to 1.1.2 / Build 37 for archive *(reverted next)*
4. `191c1cf` Roll back marketing version to 1.1.1 (keep buildNumber 37)

The version dance: we briefly bumped to 1.1.2 thinking Build 36 was already submitted. When Chanda clarified Build 36 was uploaded but NOT submitted (v1.1.1 train still open), we rolled back to v1.1.1 and kept buildNumber 37. Build 37 archive uses v1.1.1 / buildNumber 37.

## OTAs cut on runtime 1.1.1 (now orphaned but harmless)

Two OTAs pushed before deciding to bake changes into Build 37. Both baked into Build 37's embedded bundle:
1. `019f2274-ff33-7b02-a829-373f765774c2` (commit `884f07d`) — Set Daily Goal scroll fix
2. `019f22a4-6c3e-7cdb-bb2c-2c7e72771968` (commit `b6b4fff`) — Modal design refresh

No one is currently on Build 36 (never submitted), so these OTAs reach nobody. Not a problem — future OTAs on runtime 1.1.1 will reach Build 37 users normally once it approves.

## ASC copy shipped (paste-ready reference in memory)

Everything is in [[project-build37-contents]]. Highlights:

**What's New in This Version:**
```
v1.1.1 — Siri on Apple Watch + design refresh

🎙 "Hey Siri" on your wrist — Say "Hey Siri, log preset Morning Coffee in Hydro Hero" from your Apple Watch and log any saved preset hands-free.

📱 Live Activity polish — Lock Screen droplet fades cleanly at midnight and prompts a fresh tank.

🎨 Every popup, one look — Every in-app panel got a matching navy hero header and gold title. Set Goal, Enter Amount, Save Preset, Settings, and every Customize screen share one coordinated design that echoes the Home screen.

🌟 Nicer counting — Tank stats count up in sync with the fill animation.

Bug fixes:
• Save-as-Preset was silently failing on iOS — now works reliably
• Set Daily Goal's Suggested tab was cutting off the Cancel and Use This Goal buttons in Type mode — now scrolls cleanly
```

**Promo text shipped:** `"Hey Siri, log preset Morning Coffee in Hydro Hero" — now on your Apple Watch. Plus a unified navy-and-gold design refresh across every popup.` (144 chars)

**Reviewer Notes:** opens with "Build 37 = v1.1.1. First submission on the v1.1.1 train (v1.1.0 is the currently live version). No new permissions or Info.plist usage descriptions." then covers Siri on Watch, LA staleDate, modal design refresh, tank stats count-up, and the two bug fixes.

**Description add-on:** "Siri on Apple Watch — Say 'Hey Siri, log preset [name] in Hydro Hero' from your Apple Watch and log any of your saved presets hands-free — no need to open the app."

## Modal design refresh — one-line summary

The whole light-modal palette got a hero-header treatment: every popup now has a navy strip at top with a gold title, and every primary CTA has a gold outline matching Home's Set Goal / Reset buttons. Water-blue accent tokens were repurposed to navy-tint. Gold hairlines bumped up. See [[design-tokens-modals]] (updated) for the full token set.

Iterated on it via PIL mockups (`/tmp/palette-comparison.png`) — Chanda picked "C2·Home button + stronger gold hairlines" and I applied it in code, verified in sim, fixed a top-corner clipping issue (header needed `borderTopLeftRadius: 24, borderTopRightRadius: 24`).

## If review comes back with feedback

- **JS-level fix possible** → patch on `2026-06-19-bdv9`, `npx eas update --branch production --platform ios --message "..."`, no new binary needed. Reviewer reinstall sees the embedded bundle though, so for first-launch blockers cut a new binary.
- **Native or first-launch blocker** → bump buildNumber to 38, repeat archive checklist. Same landmines as always.
- **Rejection categories that have hit us before**:
  - 2.1(b) unresponsive subscribe button — Build 21 fix (defer openPaywall after modal close)
  - 5.1.1(iv) camera pre-prompt — Build 20 fix (Grant Camera Access / Continue / Open Settings)
  - First-launch freeze — Build 33→34 fix (Modal-over-Modal in profile editor)
  - Design refresh is a big visual change — if reviewer flags anything about "different look than screenshots," the ASC screenshots may need a refresh (current screenshots show the older palette)

## Post-approval parking lot

- **Screenshot refresh** — App Store screenshots still show the older modal palette. Not a rejection risk (design changes are allowed), but a polish item for a future screenshot refresh.
- **Siri onboarding** — Chanda considered adding a Siri walkthrough to onboarding. Decision was: NOT in onboarding (too dense, presets don't exist at that point). Instead: contextual tip after first preset saved + a Settings > Voice Shortcuts section + ASC promo already covers it. Follow-up work, not in this build.
- **EAS Build migration** — EAS quota reset 2026-07-01. Structurally set up in eas.json but missing `SENTRY_AUTH_TOKEN` + `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` in the production env block, and no EAS secrets declared. Local Xcode used for Build 37. To move v1.1.2+ to EAS: `eas secret:create` both keys, add env block under `build.production.ios`, preview-build to verify. Roughly an hour of setup + verification.

## Pointers

- Latest build state: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/project_build37_contents.md` (auto-loaded)
- Quick state catch-up: `~/.claude/projects/-Users-wimsby1-MyFirstApp/memory/MEMORY.md` (auto-loaded)
- Modal design tokens: `design_tokens_modals.md`
- Archive landmines: `feedback_prebuild_wipes_xcode_env_local.md` + `feedback_local_archive_buildnumber.md` + `feedback_prebuild_needs_clean.md`
- TestFlight + ASC dashboard links: `reference_external_dashboards.md`
- Tester device: Chanda's iPhone 15 Pro UDID `00008130-000425883E40001C` (Developer Mode ON)
