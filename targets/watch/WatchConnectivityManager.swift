import WatchConnectivity
import SwiftUI

// ─── Shared data model ────────────────────────────────────────────────────────

struct HydrationState {
    var hydrationOz: Double = 0
    var goalOz: Double = 64
    var pct: Double = 0
    var streak: Int = 0
    var selectedBeverages: [String] = ["water"]

    var remainingOz: Double { max(goalOz - hydrationOz, 0) }
    var goalHit: Bool       { pct >= 1.0 }
    var displayPct: Int     { min(Int(pct * 100), 999) }
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

    func sendLogDrink(amount: Double, category: String) {
        guard WCSession.default.isReachable else { return }
        let message: [String: Any] = [
            "action":   "logDrink",
            "amount":   amount,
            "category": category,
        ]
        WCSession.default.sendMessage(message, replyHandler: { [weak self] reply in
            if let confirmation = reply["confirmation"] as? String {
                DispatchQueue.main.async {
                    self?.lastLogConfirmation = confirmation
                }
            }
        }, errorHandler: { _ in })
    }

    // MARK: – WCSessionDelegate

    func session(_ session: WCSession,
                 activationDidCompleteWith state: WCSessionActivationState,
                 error: Error?) {}

    // Receive updated hydration data pushed from the iPhone
    func session(_ session: WCSession,
                 didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            var s = HydrationState()
            s.hydrationOz        = applicationContext["hydrationOz"] as? Double ?? 0
            s.goalOz             = applicationContext["goalOz"]      as? Double ?? 64
            s.pct                = applicationContext["pct"]         as? Double ?? 0
            s.streak             = applicationContext["streak"]      as? Int    ?? 0
            s.selectedBeverages  = applicationContext["selectedBeverages"] as? [String] ?? ["water"]
            self.state = s
        }
    }
}
