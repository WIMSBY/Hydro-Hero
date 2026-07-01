import Foundation
import AppIntents

// Watch-target AppIntents — mirror of ios/BeverageIntents.swift but each
// perform() ferries the log to the phone via WCSession instead of writing
// to the (device-local) App Group queue. LogPresetIntent is intentionally
// NOT mirrored here: presets live in the phone's App Group and the watch
// has no preset catalog yet.

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of water")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of water?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "water")
    return .result(dialog: "Logged \(spoken) of water.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of coffee")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of coffee?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "coffee")
    return .result(dialog: "Logged \(spoken) of coffee.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of tea")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of tea?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "tea")
    return .result(dialog: "Logged \(spoken) of tea.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of soda")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of soda?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "soda")
    return .result(dialog: "Logged \(spoken) of soda.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of juice")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of juice?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "juice")
    return .result(dialog: "Logged \(spoken) of juice.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of sports drink")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of sports drink?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "sports")
    return .result(dialog: "Logged \(spoken) of sports drink.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of milk")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of milk?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "milk")
    return .result(dialog: "Logged \(spoken) of milk.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of beer")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of beer?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "beer")
    return .result(dialog: "Logged \(spoken) of beer.")
  }
}

@available(watchOS 9.0, *)
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
    Summary("Log \(\.$amount) of cocktail")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let (oz, spoken) = HydroHeroSiriHelpers.formattedOz(amount)
    try await requestConfirmation(result: .result(dialog: "Log \(spoken) of cocktail?"))
    HydroHeroSiriHelpers.sendLogToPhone(amountOz: oz, beverageKey: "cocktail")
    return .result(dialog: "Logged \(spoken) of cocktail.")
  }
}
