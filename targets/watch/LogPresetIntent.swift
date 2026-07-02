import Foundation
import AppIntents

// Watch-target counterpart to ios/LogPresetIntent.swift. Same shape and
// spoken phrases as the phone, but perform() ferries the log to the phone
// via WCSession (HydroHeroSiriHelpers.sendLogToPhone) instead of writing
// to the App Group queue — the watch can't see the phone's App Group.
@available(watchOS 9.0, *)
struct LogPresetIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Preset"
  static var description = IntentDescription(
    "Log one of your saved Hydro Hero presets.",
    categoryName: "Hydration"
  )
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Preset",
    description: "Which preset to log",
    requestValueDialog: "Which preset?"
  )
  var preset: PresetAppEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Log \(\.$preset)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let formatted = preset.oz == preset.oz.rounded()
      ? String(format: "%.0f", preset.oz)
      : String(format: "%.1f", preset.oz)

    try await requestConfirmation(
      result: .result(dialog: "Log \(preset.label)?")
    )

    HydroHeroSiriHelpers.sendLogToPhone(amountOz: preset.oz, beverageKey: preset.beverage)
    return .result(dialog: "Logged \(preset.label) — \(formatted) ounces.")
  }
}
