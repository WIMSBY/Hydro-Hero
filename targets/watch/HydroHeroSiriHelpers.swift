import Foundation
import AppIntents
import WatchConnectivity

// Watch-target counterpart to the iPhone's HydroHeroSiriHelpers. The watch
// can't write to the phone's App Group (App Groups are device-local), so
// watch-Siri logs ferry to the phone via WCSession.transferUserInfo using
// the same dictionary shape WatchConnectivityManager.sendLogDrink already
// uses for tap-to-log from the watch UI.
//
// v1 limitation: watch-Siri always prompts in ounces. The user's mL
// preference lives in the phone's AsyncStorage; mirroring it to the watch
// would require adding `preferredUnit` to the WCSession application
// context. Deferred — first goal is "watch-Siri works at all."
@available(watchOS 9.0, *)
enum HydroHeroSiriHelpers {
  static func sendLogToPhone(amountOz: Double, beverageKey: String) {
    let info: [String: Any] = [
      "action":   "logDrink",
      "amount":   amountOz,
      "category": beverageKey,
    ]
    WCSession.default.transferUserInfo(info)
  }

  static func formattedOz(_ amountOz: Double) -> (oz: Double, spoken: String) {
    let formatted = amountOz == amountOz.rounded()
      ? String(format: "%.0f", amountOz)
      : String(format: "%.1f", amountOz)
    return (amountOz, "\(formatted) ounces")
  }
}
