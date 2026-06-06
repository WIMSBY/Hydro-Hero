/**
 * utils/WatchManager.ts — safe for Expo Go
 *
 * react-native-watch-connectivity requires a native build.
 * In Expo Go the native module is absent and attempting to require it
 * crashes the JS thread before any function-level try/catch can fire.
 *
 * Fix: load the module once at module-evaluation time inside a top-level
 * try/catch. All exported functions check `isWatchAvailable` before
 * touching the module and fail silently when it is false.
 */

// ─── Module-level load (Expo Go safe) ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let watchModule: any = null;
let isWatchAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  watchModule = require('react-native-watch-connectivity');
  // Unwrap default export if present
  if (watchModule?.default) watchModule = watchModule.default;
  isWatchAvailable = true;
} catch {
  isWatchAvailable = false;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HydrationUpdatePayload {
  hydrationOz:       number;
  goalOz:            number;
  pct:               number;    // 0–1+ (unbounded so Watch can show >100%)
  streak:            number;
  selectedBeverages: string[];  // BevCategory keys currently active
}

export interface WatchLogCommand {
  action:   'logDrink';
  amount:   number;   // oz
  category: string;   // BevCategory key, e.g. 'water'
}

/** Handler may return a short confirmation string that is sent back to the
 *  Watch as the reply to its logDrink message (shown on the Watch face). */
type WatchMessageHandler = (cmd: WatchLogCommand) => string | void | Promise<string | void>;

// ─── Module state ─────────────────────────────────────────────────────────────

let _handler:       WatchMessageHandler | null         = null;
let _subscriptions: { remove: () => void }[]           = [];
let _initialized    = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start WatchConnectivity session and register listeners for Watch→Phone messages.
 * No-op in Expo Go or when no Watch is paired.
 */
export async function initWatch(): Promise<void> {
  if (!isWatchAvailable || !watchModule || _initialized) return;
  try {
    const isPaired: boolean = await (
      typeof watchModule.getIsPaired === 'function'
        ? watchModule.getIsPaired()
        : Promise.resolve(false)
    ).catch(() => false);
    if (!isPaired) return;

    const events = watchModule.watchEvents;
    if (events && typeof events.addListener === 'function') {
      // Legacy: sendMessage path. Kept for safety, but the Watch now uses
      // transferUserInfo (see 'user-info' listener below) because sendMessage
      // is silently dropped when the iPhone app isn't foregrounded.
      _subscriptions.push(
        events.addListener(
          'message',
          (message: unknown, reply?: (response: Record<string, unknown>) => void) => {
            (async () => {
              const msg = message as WatchLogCommand;
              let confirmation = `+${msg?.amount ?? ''} oz logged!`;
              try {
                if (msg?.action === 'logDrink' && _handler) {
                  const result = await _handler(msg);
                  if (typeof result === 'string' && result.length > 0) confirmation = result;
                }
              } catch {}
              try { reply?.({ confirmation }); } catch {}
            })();
          }
        )
      );

      // Watch → Phone log drinks now arrive via transferUserInfo, which queues
      // them and delivers when the iPhone app next wakes up (even from cold).
      // The 'user-info' callback receives an ARRAY of queued payloads, not a
      // single one — iterate so we don't drop logs (and so msg.action isn't
      // undefined on the array wrapper, which silently swallowed every log).
      _subscriptions.push(
        events.addListener('user-info', (userInfos: unknown) => {
          (async () => {
            try {
              const list = Array.isArray(userInfos) ? userInfos : [userInfos];
              for (const info of list) {
                const msg = info as WatchLogCommand;
                if (msg?.action === 'logDrink' && _handler) {
                  await _handler(msg);
                }
              }
            } catch {}
          })();
        })
      );
    }
    _initialized = true;
  } catch {}
}

/**
 * Push the latest hydration state to the Watch via applicationContext.
 * No-op in Expo Go or when Watch is not reachable.
 */
export async function sendHydrationUpdate(data: HydrationUpdatePayload): Promise<void> {
  if (!isWatchAvailable || !watchModule) return;
  try {
    if (typeof watchModule.updateApplicationContext !== 'function') return;
    await watchModule.updateApplicationContext({
      hydrationOz:       data.hydrationOz,
      goalOz:            data.goalOz,
      pct:               data.pct,
      streak:            data.streak,
      selectedBeverages: data.selectedBeverages,
    });
  } catch {}
}

/**
 * Register a callback invoked whenever the Watch sends a log command.
 * Safe to call before initWatch() — handler is stored separately.
 */
export function setWatchMessageHandler(handler: WatchMessageHandler): void {
  _handler = handler;
}

/** Remove event listeners and reset state. Safe to call any time. */
export function teardownWatch(): void {
  for (const s of _subscriptions) { try { s.remove(); } catch {} }
  _subscriptions = [];
  _initialized   = false;
  _handler       = null;
}

/** Returns the current Watch availability status. */
export function getWatchStatus(): { isAvailable: boolean; isPaired: boolean; isReachable: boolean } {
  return { isAvailable: isWatchAvailable, isPaired: false, isReachable: false };
}
