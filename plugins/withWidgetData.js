/**
 * withWidgetData.js
 *
 * Expo config plugin that injects a minimal native Swift+ObjC module into the
 * iOS build so the main React Native app can write hydration data to the shared
 * App Group UserDefaults that the widget reads.
 *
 * The module exposes:  NativeModules.LLWidgetSync.updateData(hydrationOz, goalOz, pct)
 *
 * This file is executed during `npx expo prebuild` — nothing here runs at app
 * runtime.  The generated native files land in the ios/ folder and are
 * compiled as part of the normal Xcode build.
 */

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ─── Native module Swift source ───────────────────────────────────────────────
// Compiled into the MAIN app target (not the widget extension).
// Uses WidgetCenter to trigger an immediate widget refresh whenever the app
// writes new data to the shared UserDefaults container.
const SWIFT_SOURCE = `
import Foundation
import WidgetKit

@objc(LLWidgetSync)
class LLWidgetSync: NSObject {

  @objc(updateData:goalOz:pct:)
  func updateData(hydrationOz: Double, goalOz: Double, pct: Double) {
    guard let defaults = UserDefaults(suiteName: "group.com.wimsby.liquidluck") else { return }
    defaults.set(hydrationOz, forKey: "hydrationOz")
    defaults.set(goalOz,      forKey: "goalOz")
    defaults.set(pct,         forKey: "hydrationPct")
    defaults.set(Date().timeIntervalSince1970, forKey: "lastUpdated")
    defaults.synchronize()

    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
`.trimStart();

// ─── ObjC bridge that registers the Swift class with the RN bridge ────────────
const OBJC_SOURCE = `
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LLWidgetSync, NSObject)
RCT_EXTERN_METHOD(updateData:(double)hydrationOz
                  goalOz:(double)goalOz
                  pct:(double)pct)
@end
`.trimStart();

const SWIFT_FILENAME = 'LLWidgetSync.swift';
const OBJC_FILENAME  = 'LLWidgetSync.m';

// ─── Step 1: Write the source files to ios/ during prebuild ───────────────────
function withWriteNativeFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      fs.writeFileSync(path.join(iosDir, SWIFT_FILENAME), SWIFT_SOURCE, 'utf8');
      fs.writeFileSync(path.join(iosDir, OBJC_FILENAME),  OBJC_SOURCE,  'utf8');
      return config;
    },
  ]);
}

// ─── Step 2: Add both files to the Xcode project so they get compiled ─────────
function withAddToXcode(config) {
  return withXcodeProject(config, (config) => {
    const project     = config.modResults;
    const projectName = config.modRequest.projectName;

    // Find the main app group by name (same as project name after prebuild)
    const groups = project.hash.project.objects['PBXGroup'] || {};
    const mainGroupKey = Object.keys(groups).find(
      (key) => !key.endsWith('_comment') && groups[key].name === projectName
    );

    [SWIFT_FILENAME, OBJC_FILENAME].forEach((filename) => {
      if (!project.hasFile(filename)) {
        project.addSourceFile(filename, {}, mainGroupKey);
      }
    });

    return config;
  });
}

// ─── Compose and export ───────────────────────────────────────────────────────
module.exports = function withWidgetData(config) {
  config = withWriteNativeFiles(config);
  config = withAddToXcode(config);
  return config;
};
