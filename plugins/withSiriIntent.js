/**
 * withSiriIntent.js
 *
 * Expo config plugin that injects Swift sources for the Siri / App Intents
 * voice-logging feature into the main iOS app target. Mirrors the
 * withWidgetData.js pattern.
 *
 * Adds 4 files to the main app target:
 *   LogDrinkIntent.swift          — AppIntent that appends a log entry to
 *                                    the shared App Group queue.
 *   HydroHeroAppShortcuts.swift   — AppShortcutsProvider declaration so
 *                                    Siri offers built-in phrases.
 *   LLSiriQueue.swift             — RN native module exposing readAndClear()
 *                                    so JS can drain the queue on foreground.
 *   LLSiriQueue.m                 — ObjC bridge for the above.
 *
 * All four are compiled into the MAIN app target. The intent runs in the
 * background (openAppWhenRun = false), writes to App Group UserDefaults
 * under key "siri_queue", and returns. The JS app drains the queue on
 * launch + on AppState transitions to "active".
 *
 * Like withWidgetData.js, nothing here runs at app runtime — only during
 * `npx expo prebuild`.
 */

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const APP_GROUP_ID = 'group.com.wimsby.hydrationstation';

// ─── LogDrinkIntent.swift ─────────────────────────────────────────────────────
// Phase 1: water-only, oz-only. Phase 2 adds BeverageAppEnum + ml.
const LOG_DRINK_INTENT_SWIFT = `
import Foundation
import AppIntents

@available(iOS 16.0, *)
struct LogDrinkIntent: AppIntent {
  static var title: LocalizedStringResource = "Log Water"
  static var description = IntentDescription(
    "Log a glass of water in Hydro Hero.",
    categoryName: "Hydration"
  )
  // Runs silently in the background — no app launch.
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "Ounces",
    description: "How many ounces to log",
    inclusiveRange: (0.5, 200.0)
  )
  var amount: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Log \\(\\.$amount) ounces of water")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let formatted = amount == amount.rounded()
      ? String(format: "%.0f", amount)
      : String(format: "%.1f", amount)

    // Confirm verbally before writing the side effect. CarPlay / HomePod
    // / no-screen surfaces force confirmation here anyway.
    try await requestConfirmation(
      result: .result(dialog: "Log \\(formatted) ounces of water?")
    )

    guard let defaults = UserDefaults(suiteName: "${APP_GROUP_ID}") else {
      return .result(dialog: "Hydro Hero is not set up correctly.")
    }

    var queue = defaults.array(forKey: "siri_queue") as? [[String: Any]] ?? []
    let entry: [String: Any] = [
      "amount":    amount,
      "unit":      "oz",
      "beverage":  "water",
      "timestamp": Date().timeIntervalSince1970,
    ]
    queue.append(entry)
    defaults.set(queue, forKey: "siri_queue")

    return .result(dialog: "Logged \\(formatted) ounces of water.")
  }
}
`.trimStart();

// ─── HydroHeroAppShortcuts.swift ──────────────────────────────────────────────
// AppShortcutsProvider — Apple surfaces these phrases automatically.
// Users don't have to create a Shortcut manually; "Hey Siri, log water
// in Hydro Hero" works out of the box.
const APP_SHORTCUTS_SWIFT = `
import AppIntents

@available(iOS 16.0, *)
struct HydroHeroAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LogDrinkIntent(),
      phrases: [
        "Log water in \\(.applicationName)",
        "Log \\(\\.$amount) ounces of water in \\(.applicationName)",
        "Log a glass of water in \\(.applicationName)",
      ],
      shortTitle: "Log Water",
      systemImageName: "drop.fill"
    )
  }
}
`.trimStart();

// ─── LLSiriQueue.swift ────────────────────────────────────────────────────────
// Native module exposing the queue to JS. Reads + clears atomically.
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

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
`.trimStart();

// ─── LLSiriQueue.m (ObjC bridge) ──────────────────────────────────────────────
const SIRI_QUEUE_OBJC = `
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LLSiriQueue, NSObject)
RCT_EXTERN_METHOD(readAndClear:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
`.trimStart();

const FILES = [
  ['LogDrinkIntent.swift',        LOG_DRINK_INTENT_SWIFT],
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
