import WatchConnectivity
import SwiftUI
import AppIntents

// ─── Shared data model ────────────────────────────────────────────────────────

struct HydrationState {
    var hydrationOz: Double = 0
    var goalOz: Double = 64
    var pct: Double = 0
    var streak: Int = 0
    var selectedBeverages: [String] = ["water"]

    var remainingOz: Double { max(goalOz - hydrationOz, 0) }
    var goalHit: Bool       { pct >= 1.0 }
    // Round to nearest, not truncate, so 21.9% shows as 22% (matches phone).
    var displayPct: Int     { min(Int((pct * 100).rounded()), 999) }
}

// ─── WatchConnectivityManager ─────────────────────────────────────────────────

final class WatchConnectivityManager: NSObject, WCSessionDelegate, ObservableObject {

    static let shared = WatchConnectivityManager()

    @Published var state = HydrationState()
    @Published var lastLogConfirmation: String? = nil

    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    // MARK: – Send log command to iPhone

    // transferUserInfo queues the log and delivers it when the iPhone app next
    // wakes up — works even if the iPhone app is backgrounded or terminated.
    // sendMessage was unreliable because it silently dropped when the iPhone
    // app wasn't foregrounded (isReachable == false).
    func sendLogDrink(amount: Double, category: String) {
        let info: [String: Any] = [
            "action":   "logDrink",
            "amount":   amount,
            "category": category,
        ]
        WCSession.default.transferUserInfo(info)
    }

    // MARK: – WCSessionDelegate

    func session(_ session: WCSession,
                 activationDidCompleteWith state: WCSessionActivationState,
                 error: Error?) {
        // `didReceiveApplicationContext` only fires on NEW context. If the iPhone
        // pushed before the watch app launched, we have to read the persisted
        // context manually — otherwise we sit on Swift defaults (selectedBeverages
        // = ["water"]) until the iPhone pushes again.
        guard state == .activated else { return }
        let ctx = session.receivedApplicationContext
        if !ctx.isEmpty {
            DispatchQueue.main.async { [weak self] in
                self?.applyContext(ctx)
            }
        }
    }

    // Receive updated hydration data pushed from the iPhone
    func session(_ session: WCSession,
                 didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            self?.applyContext(applicationContext)
        }
    }

    private func applyContext(_ ctx: [String: Any]) {
        var s = HydrationState()
        s.hydrationOz        = ctx["hydrationOz"] as? Double ?? 0
        s.goalOz             = ctx["goalOz"]      as? Double ?? 64
        s.pct                = ctx["pct"]         as? Double ?? 0
        s.streak             = ctx["streak"]      as? Int    ?? 0
        s.selectedBeverages  = ctx["selectedBeverages"] as? [String] ?? ["water"]
        self.state = s

        // Mirror the phone's Siri preset catalog to local UserDefaults so
        // watch-side LogPresetIntent can enumerate presets even when the
        // watch app is not foregrounded. Only overwrite when the phone
        // actually sent the key — an update without siriPresets should
        // leave the cached copy alone.
        if let presets = ctx["siriPresets"] as? [[String: Any]] {
            UserDefaults.standard.set(presets, forKey: "siri_catalog")
            // Force watchOS to re-query PresetEntityQuery.suggestedEntities()
            // so Siri's phrase grammar picks up the newly-synced presets —
            // same reason as the phone-side call in LLSiriQueue.writeCatalog.
            if #available(watchOS 9.0, *) {
                HydroHeroAppShortcuts.updateAppShortcutParameters()
            }
        }
    }
}
