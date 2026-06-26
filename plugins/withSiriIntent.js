/**
 * withSiriIntent.js
 *
 * Expo config plugin that injects Swift sources for the Siri / App Intents
 * voice-logging feature into the main iOS app target.
 *
 * Phase 2 final architecture: one AppIntent per default beverage. The
 * beverage choice is encoded in the intent type itself (LogWaterIntent,
 * LogCoffeeIntent, ...) rather than a parameter on a single LogDrinkIntent.
 * This is the only reliable way to avoid Siri's voice matcher hijacking
 * preset names that contain beverage words ("Circa Water" → LogDrink
 * fuzzy-matches "water" → wrong intent).
 *
 * Files added to the main app target:
 *   HydroHeroSiriHelpers.swift    — Shared App Group queue write + oz
 *                                    formatting helpers.
 *   BeverageIntents.swift         — One AppIntent per default beverage
 *                                    (Water/Coffee/Tea/Soda/Juice/Sports
 *                                    Drink/Milk).
 *   PresetAppEntity.swift         — AppEntity + EntityQuery mirroring the
 *                                    user's custom presets from siri_catalog
 *                                    in App Group UserDefaults.
 *   LogPresetIntent.swift         — AppIntent for "Log preset <preset>".
 *   HydroHeroAppShortcuts.swift   — AppShortcutsProvider with literal phrases
 *                                    per beverage + preset phrases.
 *   LLSiriQueue.swift             — RN native module exposing readAndClear()
 *                                    (queue drain) + writeCatalog() (push
 *                                    presets to App Group from JS).
 *   LLSiriQueue.m                 — ObjC bridge for the above.
 *
 * Intents run in the background (openAppWhenRun = false), write to App
 * Group UserDefaults under key "siri_queue", and return. JS drains the
 * queue on launch + on AppState transitions to "active".
 *
 * Like withWidgetData.js, nothing here runs at app runtime — only during
 * `npx expo prebuild`.
 */

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const APP_GROUP_ID = 'group.com.wimsby.hydrationstation';

// ─── HydroHeroSiriHelpers.swift ───────────────────────────────────────────────
// Shared helpers used by every beverage intent — keeps each intent body small.
const SIRI_HELPERS_SWIFT = `
import Foundation

@available(iOS 16.0, *)
enum HydroHeroSiriHelpers {
  static func appendQueueEntry(amountOz: Double, beverageKey: String) {
    guard let defaults = UserDefaults(suiteName: "${APP_GROUP_ID}") else { return }
    var queue = defaults.array(forKey: "siri_queue") as? [[String: Any]] ?? []
    let entry: [String: Any] = [
      "amount":    amountOz,
      "unit":      "oz",
      "beverage":  beverageKey,
      "timestamp": Date().timeIntervalSince1970,
    ]
    queue.append(entry)
    defaults.set(queue, forKey: "siri_queue")
  }

  // Format a Double-in-ounces for the confirmation dialog. Amount params
  // are typed as Double (not Measurement<UnitVolume>) so they can appear
  // in AppShortcut phrases — Apple's voice matcher only allows primitive
  // Number / String / AppEntity / AppEnum bindings in phrase grammar,
  // not Measurement. The literal "ounces" / "oz" word in the phrase
  // tells Siri the unit; the queue always stores ounces.
  static func formattedOz(_ amountOz: Double) -> (oz: Double, spoken: String) {
    let formatted = amountOz == amountOz.rounded()
      ? String(format: "%.0f", amountOz)
      : String(format: "%.1f", amountOz)
    return (amountOz, "\\(formatted) ounces")
  }
}
`.trimStart();

// ─── BeverageIntents.swift ────────────────────────────────────────────────────
// One AppIntent per default beverage. Each intent has the same shape — only
// the title, beverage key, and speech word vary. The beverage is hardcoded so
// literal phrases like "Log water in Hydro Hero" don't need a $beverage
// parameter that Siri would fuzzy-match from preset names.
const BEVERAGE_INTENTS_SWIFT = `
import Foundation
import AppIntents

@available(iOS 16.0, *)
struct LogWaterIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Water"
  static var description = IntentDescription("Log water in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of water")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of water?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "water")
    return .result(dialog: "Logged \\(spoken) of water.")
  }
}

@available(iOS 16.0, *)
struct LogCoffeeIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Coffee"
  static var description = IntentDescription("Log coffee in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of coffee")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of coffee?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "coffee")
    return .result(dialog: "Logged \\(spoken) of coffee.")
  }
}

@available(iOS 16.0, *)
struct LogTeaIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Tea"
  static var description = IntentDescription("Log tea in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of tea")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of tea?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "tea")
    return .result(dialog: "Logged \\(spoken) of tea.")
  }
}

@available(iOS 16.0, *)
struct LogSodaIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Soda"
  static var description = IntentDescription("Log soda in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of soda")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of soda?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "soda")
    return .result(dialog: "Logged \\(spoken) of soda.")
  }
}

@available(iOS 16.0, *)
struct LogJuiceIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Juice"
  static var description = IntentDescription("Log juice in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of juice")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of juice?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "juice")
    return .result(dialog: "Logged \\(spoken) of juice.")
  }
}

@available(iOS 16.0, *)
struct LogSportsDrinkIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Sports Drink"
  static var description = IntentDescription("Log a sports drink in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of sports drink")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of sports drink?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "sports")
    return .result(dialog: "Logged \\(spoken) of sports drink.")
  }
}

@available(iOS 16.0, *)
struct LogMilkIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Milk"
  static var description = IntentDescription("Log milk in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of milk")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of milk?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "milk")
    return .result(dialog: "Logged \\(spoken) of milk.")
  }
}

@available(iOS 16.0, *)
struct LogBeerIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Beer"
  static var description = IntentDescription("Log beer in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of beer")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of beer?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "beer")
    return .result(dialog: "Logged \\(spoken) of beer.")
  }
}

@available(iOS 16.0, *)
struct LogCocktailIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Cocktail"
  static var description = IntentDescription("Log a cocktail in Hydro Hero.", categoryName: "Hydration")
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Amount",
    requestValueDialog: "How many ounces?"
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) of cocktail")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \\(spoken) of cocktail?"))
    HydroHeroSiriHelpers.appendQueueEntry(amountOz: oz, beverageKey: "cocktail")
    return .result(dialog: "Logged \\(spoken) of cocktail.")
  }
}
`.trimStart();

// ─── PresetAppEntity.swift ────────────────────────────────────────────────────
const PRESET_ENTITY_SWIFT = `
import AppIntents
import Foundation

@available(iOS 16.0, *)
struct PresetAppEntity: AppEntity {
  let id: String
  let label: String
  let oz: Double
  let beverage: String

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Preset"

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\\(label)", subtitle: "\\(beverageLabel)")
  }

  private var beverageLabel: String {
    switch beverage {
    case "water":  return "Water"
    case "coffee": return "Coffee"
    case "tea":    return "Tea"
    case "soda":   return "Soda"
    case "juice":  return "Juice"
    case "sports": return "Sports Drink"
    case "milk":   return "Milk"
    case "beer":   return "Beer"
    case "wine":   return "Wine"
    case "cocktail": return "Cocktail"
    default: return beverage.capitalized
    }
  }

  static var defaultQuery = PresetEntityQuery()
}

@available(iOS 16.0, *)
struct PresetEntityQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [PresetAppEntity] {
    loadCatalog().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [PresetAppEntity] {
    loadCatalog()
  }

  private func loadCatalog() -> [PresetAppEntity] {
    guard let defaults = UserDefaults(suiteName: "${APP_GROUP_ID}"),
          let raw = defaults.array(forKey: "siri_catalog") as? [[String: Any]]
    else { return [] }
    return raw.compactMap { dict in
      guard let id = dict["id"] as? String,
            let label = dict["label"] as? String,
            let oz = dict["oz"] as? Double,
            let beverage = dict["beverage"] as? String
      else { return nil }
      return PresetAppEntity(id: id, label: label, oz: oz, beverage: beverage)
    }
  }
}
`.trimStart();

// ─── LogPresetIntent.swift ────────────────────────────────────────────────────
const LOG_PRESET_INTENT_SWIFT = `
import Foundation
import AppIntents

@available(iOS 16.0, *)
struct LogPresetIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Preset"
  static var description = IntentDescription(
    "Log one of your saved presets in Hydro Hero.",
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
    Summary("Log \\(\\.$preset)")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let formatted = preset.oz == preset.oz.rounded()
      ? String(format: "%.0f", preset.oz)
      : String(format: "%.1f", preset.oz)

    try await requestConfirmation(
      result: .result(dialog: "Log \\(preset.label)?")
    )

    HydroHeroSiriHelpers.appendQueueEntry(amountOz: preset.oz, beverageKey: preset.beverage)
    return .result(dialog: "Logged \\(preset.label) — \\(formatted) ounces.")
  }
}
`.trimStart();

// ─── HydroHeroAppShortcuts.swift ──────────────────────────────────────────────
// Each beverage gets one AppShortcut with a literal phrase. LogPreset has
// multiple discriminator-prefixed phrases so it can't be fuzzy-matched away
// by the beverage AppShortcuts.
const APP_SHORTCUTS_SWIFT = `
import AppIntents

@available(iOS 16.0, *)
struct HydroHeroAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    // Beverage phrases CANNOT include \\(\\.$amount) — Apple's
    // AppShortcuts framework only allows AppEntity / AppEnum bindings
    // in spoken phrases, not Double (or Measurement, see commit a8242da).
    // One-shot "log 10 oz of water" requires an AppEnum amount type;
    // for now the amount is elicited via the @Parameter requestValueDialog
    // ("How many ounces?") in a two-turn flow.
    AppShortcut(
      intent: LogWaterIntent(),
      phrases: [
        "Log water in \\(.applicationName)",
        "Add water in \\(.applicationName)",
      ],
      shortTitle: "Log Water",
      systemImageName: "drop.fill"
    )
    AppShortcut(
      intent: LogCoffeeIntent(),
      phrases: ["Log coffee in \\(.applicationName)"],
      shortTitle: "Log Coffee",
      systemImageName: "cup.and.saucer.fill"
    )
    AppShortcut(
      intent: LogTeaIntent(),
      phrases: ["Log tea in \\(.applicationName)"],
      shortTitle: "Log Tea",
      systemImageName: "mug.fill"
    )
    AppShortcut(
      intent: LogSodaIntent(),
      phrases: ["Log soda in \\(.applicationName)"],
      shortTitle: "Log Soda",
      systemImageName: "takeoutbag.and.cup.and.straw.fill"
    )
    AppShortcut(
      intent: LogJuiceIntent(),
      phrases: ["Log juice in \\(.applicationName)"],
      shortTitle: "Log Juice",
      systemImageName: "wineglass.fill"
    )
    AppShortcut(
      intent: LogSportsDrinkIntent(),
      phrases: [
        "Log sports drink in \\(.applicationName)",
        "Log a sports drink in \\(.applicationName)",
      ],
      shortTitle: "Log Sports Drink",
      systemImageName: "figure.run"
    )
    AppShortcut(
      intent: LogMilkIntent(),
      phrases: ["Log milk in \\(.applicationName)"],
      shortTitle: "Log Milk",
      systemImageName: "drop.fill"
    )
    AppShortcut(
      intent: LogBeerIntent(),
      phrases: ["Log beer in \\(.applicationName)"],
      shortTitle: "Log Beer",
      systemImageName: "mug.fill"
    )
    AppShortcut(
      intent: LogCocktailIntent(),
      phrases: [
        "Log cocktail in \\(.applicationName)",
        "Log a cocktail in \\(.applicationName)",
      ],
      shortTitle: "Log Cocktail",
      systemImageName: "wineglass.fill"
    )
    // Preset phrases ALL require the literal word "preset" before the
    // \\(.$preset) binding. Without that anchor, Siri's voice matcher
    // routes "Log Circa Water in Hydro Hero" to LogWaterIntent because
    // the simpler "Log [beverage] in [app]" template wins ranking.
    AppShortcut(
      intent: LogPresetIntent(),
      phrases: [
        "Log a preset in \\(.applicationName)",
        "Log preset in \\(.applicationName)",
        "Log preset \\(\\.$preset) in \\(.applicationName)",
        "Log my preset \\(\\.$preset) in \\(.applicationName)",
        "Use my preset \\(\\.$preset) in \\(.applicationName)",
        "Use preset \\(\\.$preset) in \\(.applicationName)",
      ],
      shortTitle: "Log Preset",
      systemImageName: "list.star"
    )
  }
}
`.trimStart();

// ─── LLSiriQueue.swift ────────────────────────────────────────────────────────
const SIRI_QUEUE_SWIFT = `
import Foundation

@objc(LLSiriQueue)
class LLSiriQueue: NSObject {

  @objc(readAndClear:rejecter:)
  func readAndClear(_ resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: "${APP_GROUP_ID}") else {
      resolve([])
      return
    }
    let queue = defaults.array(forKey: "siri_queue") as? [[String: Any]] ?? []
    defaults.removeObject(forKey: "siri_queue")
    resolve(queue)
  }

  @objc(writeCatalog:resolver:rejecter:)
  func writeCatalog(_ presets: NSArray,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let defaults = UserDefaults(suiteName: "${APP_GROUP_ID}") else {
      resolve(false)
      return
    }
    defaults.set(presets, forKey: "siri_catalog")

    // Force iOS to re-query PresetEntityQuery.suggestedEntities() so Siri's
    // phrase grammar picks up newly-added presets. Without this, Siri's
    // index of LogPreset entities stays at whatever it was at app install
    // time (often empty) — phrases like "Log preset Circa Water" can't
    // bind and fall through to LogDrink.
    if #available(iOS 16.0, *) {
      HydroHeroAppShortcuts.updateAppShortcutParameters()
    }

    resolve(true)
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
`.trimStart();

// ─── LLSiriQueue.m (ObjC bridge) ──────────────────────────────────────────────
const SIRI_QUEUE_OBJC = `
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LLSiriQueue, NSObject)
RCT_EXTERN_METHOD(readAndClear:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(writeCatalog:(NSArray *)presets
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
`.trimStart();

const FILES = [
  ['HydroHeroSiriHelpers.swift',  SIRI_HELPERS_SWIFT],
  ['BeverageIntents.swift',       BEVERAGE_INTENTS_SWIFT],
  ['PresetAppEntity.swift',       PRESET_ENTITY_SWIFT],
  ['LogPresetIntent.swift',       LOG_PRESET_INTENT_SWIFT],
  ['HydroHeroAppShortcuts.swift', APP_SHORTCUTS_SWIFT],
  ['LLSiriQueue.swift',           SIRI_QUEUE_SWIFT],
  ['LLSiriQueue.m',               SIRI_QUEUE_OBJC],
];

// ─── Step 1: write source files to ios/ during prebuild ───────────────────────
function withWriteNativeFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      for (const [filename, source] of FILES) {
        fs.writeFileSync(path.join(iosDir, filename), source, 'utf8');
      }

      // LLSiriQueue.swift uses RCTPromiseResolveBlock / RCTPromiseRejectBlock,
      // which are RN typedefs that aren't visible to Swift unless the
      // bridging header imports them. Expo prebuild generates an empty
      // bridging header by default, so we patch it here.
      const projectName = config.modRequest.projectName;
      const bridgingHeader = path.join(
        iosDir,
        projectName,
        `${projectName}-Bridging-Header.h`,
      );
      if (fs.existsSync(bridgingHeader)) {
        const current = fs.readFileSync(bridgingHeader, 'utf8');
        if (!current.includes('RCTBridgeModule.h')) {
          fs.writeFileSync(
            bridgingHeader,
            current.trimEnd() + '\n\n#import <React/RCTBridgeModule.h>\n',
            'utf8',
          );
        }
      }
      return config;
    },
  ]);
}

// ─── Step 2: add files to the Xcode project so they get compiled ──────────────
function withAddToXcode(config) {
  return withXcodeProject(config, (config) => {
    const project     = config.modResults;
    const projectName = config.modRequest.projectName;

    const groups = project.hash.project.objects['PBXGroup'] || {};
    const mainGroupKey = Object.keys(groups).find(
      (key) => !key.endsWith('_comment') && groups[key].name === projectName,
    );

    for (const [filename] of FILES) {
      if (!project.hasFile(filename)) {
        project.addSourceFile(filename, {}, mainGroupKey);
      }
    }
    return config;
  });
}

module.exports = function withSiriIntent(config) {
  config = withWriteNativeFiles(config);
  config = withAddToXcode(config);
  return config;
};
