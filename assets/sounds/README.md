# Sound Pack Assets

Drop CC0 / royalty-free clips into `flowing/`, `nature/`, and `scifi/` with the exact
filenames below. Once all 6 files are present in a pack, flip that pack's `tones`
entries in `utils/SoundPacks.ts` from `NoteSpec[]` to
`{ asset: require('../assets/sounds/<pack>/<file>') }`.

The loader (`utils/SoundManager.ts`) already handles both formats — synth tones and real
files can mix freely within a pack.

## Format requirements

- **Format:** MP3 or M4A (expo-av on iOS plays both natively). M4A is what QuickTime
  Player's trim exports; either is fine. Update the `require(...)` extension if you swap.
- **Total size budget per pack:** under 500 KB (each role file under ~70 KB)
- Trim to the durations listed below; QuickTime Player (`⌘T` to trim, then File → Export
  as → Audio Only saves an M4A) or Audacity both work

## Filenames per pack

```
flowing/
  button_tap.mp3   ~30 ms      bubble pop / quick blip
  droplet.mp3      ~80 ms      small droplet falling cue
  water_log.mp3    ~400 ms     water splash
  jackpot.mp3      ~1.2 s      fountain spray crescendo
  badge_unlock.mp3 ~900 ms     glass chime / water glass ding
  morning.mp3      ~400 ms     water turn-on / soft spray

nature/
  button_tap.mp3   ~30 ms      leaf rustle / twig snap
  droplet.mp3      ~80 ms      small droplet falling cue
  water_log.mp3    ~500 ms     single rain drop into puddle
  jackpot.mp3      ~1.5 s      bird song trailing into chime
  badge_unlock.mp3 ~1.5 s      wind chime
  morning.mp3      ~500 ms     single dawn bird call

scifi/
  button_tap.mp3   ~30 ms      laser click / UI blip
  droplet.mp3      ~80 ms      phaser / energy bolt zip
  water_log.mp3    ~400 ms     power-up charge into landing tone
  jackpot.mp3      ~1.2 s      energy build into burst / warp jump
  badge_unlock.mp3 ~900 ms     teleport ping / power discharge
  morning.mp3      ~400 ms     system startup beep sequence
```
