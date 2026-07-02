import AppIntents

// Watch-target AppShortcutsProvider — same 9 beverages as the phone plus
// LogPreset. Preset catalog is synced from the phone via WCSession (see
// WatchConnectivityManager.applyContext) into local UserDefaults, then
// read by PresetEntityQuery when Siri surfaces the shortcut. Spoken
// phrases use the same `(.applicationName)` pattern so they read
// "Log water in Hydro Hero" on both phone and watch Siri.
//
// Preset phrase MUST include the literal keyword "preset" before the
// `(.$preset)` binding, or Siri hijacks preset names like "Circa Water"
// into LogWaterIntent (see feedback-appshortcut-preset-keyword-anchor).
@available(watchOS 9.0, *)
struct HydroHeroAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogWaterIntent(),
      phrases: [
        "Log water in \(.applicationName)",
        "Add water in \(.applicationName)",
      ],
      shortTitle: "Log Water",
      systemImageName: "drop.fill"
    )
    AppShortcut(
      intent: LogCoffeeIntent(),
      phrases: ["Log coffee in \(.applicationName)"],
      shortTitle: "Log Coffee",
      systemImageName: "cup.and.saucer.fill"
    )
    AppShortcut(
      intent: LogTeaIntent(),
      phrases: ["Log tea in \(.applicationName)"],
      shortTitle: "Log Tea",
      systemImageName: "mug.fill"
    )
    AppShortcut(
      intent: LogSodaIntent(),
      phrases: ["Log soda in \(.applicationName)"],
      shortTitle: "Log Soda",
      systemImageName: "takeoutbag.and.cup.and.straw.fill"
    )
    AppShortcut(
      intent: LogJuiceIntent(),
      phrases: ["Log juice in \(.applicationName)"],
      shortTitle: "Log Juice",
      systemImageName: "wineglass.fill"
    )
    AppShortcut(
      intent: LogSportsDrinkIntent(),
      phrases: [
        "Log sports drink in \(.applicationName)",
        "Log a sports drink in \(.applicationName)",
      ],
      shortTitle: "Log Sports Drink",
      systemImageName: "figure.run"
    )
    AppShortcut(
      intent: LogMilkIntent(),
      phrases: ["Log milk in \(.applicationName)"],
      shortTitle: "Log Milk",
      systemImageName: "drop.fill"
    )
    AppShortcut(
      intent: LogBeerIntent(),
      phrases: ["Log beer in \(.applicationName)"],
      shortTitle: "Log Beer",
      systemImageName: "mug.fill"
    )
    AppShortcut(
      intent: LogCocktailIntent(),
      phrases: [
        "Log cocktail in \(.applicationName)",
        "Log a cocktail in \(.applicationName)",
      ],
      shortTitle: "Log Cocktail",
      systemImageName: "wineglass.fill"
    )
    AppShortcut(
      intent: LogPresetIntent(),
      phrases: [
        "Log preset \(\.$preset) in \(.applicationName)",
        "Log \(\.$preset) preset in \(.applicationName)",
      ],
      shortTitle: "Log Preset",
      systemImageName: "star.fill"
    )
  }
}
