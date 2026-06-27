/**
 * withLiveActivity.js
 *
 * Expo config plugin that wires the main app for ActivityKit Live Activities:
 *
 *   1. Writes LLLiveActivity.swift + LLLiveActivity.m into ios/ so the main
 *      RN bridge exposes startActivity/updateActivity/endActivity to JS.
 *   2. Adds both files to the main Xcode target so they actually compile.
 *   3. Injects NSSupportsLiveActivities = true into the main app's Info.plist.
 *
 * The widget extension declares the ActivityConfiguration separately in
 * targets/widget/LiveActivity.swift; this plugin only touches the main app.
 *
 * HydrationActivityAttributes is duplicated here on purpose — ActivityKit
 * matches activities across processes by struct name + Codable shape, so the
 * two copies must stay byte-identical. If you change one, change both.
 *
 * Executed during `npx expo prebuild` only — nothing here runs at runtime.
 */

const {
  withDangerousMod,
  withXcodeProject,
  withInfoPlist,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ─── Swift: ActivityAttributes + native module ────────────────────────────────

const SWIFT_SOURCE = `
import Foundation
import ActivityKit

// Mirror of targets/widget/LiveActivity.swift — keep field names + types
// identical so ActivityKit matches activities across the app and the widget.
@available(iOS 16.2, *)
struct HydrationActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var hydrationOz: Double
    var goalOz: Double
    var pct: Double
  }
  var startedAt: Date
}

@objc(LLLiveActivity)
class LLLiveActivity: NSObject {

  // All three methods operate on Activity<HydrationActivityAttributes>.activities
  // — the live snapshot iOS maintains across app launches. We don't track our
  // own pointer because (a) it goes stale across hot reloads and process
  // restarts, and (b) prior debug sessions / interrupted starts can leave
  // orphan activities that we still need to update or end.

  @objc(startActivity:goalOz:resolver:rejecter:)
  func startActivity(hydrationOz: Double,
                     goalOz: Double,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject:  @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.2, *) else {
      reject("UNSUPPORTED", "Live Activities require iOS 16.2+", nil)
      return
    }
    // Live Activities can be globally disabled by the user in Settings.
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      reject("DISABLED", "Live Activities are disabled in system settings", nil)
      return
    }
    let pct   = goalOz > 0 ? hydrationOz / goalOz : 0
    let attrs = HydrationActivityAttributes(startedAt: Date())
    let state = HydrationActivityAttributes.ContentState(
      hydrationOz: hydrationOz, goalOz: goalOz, pct: pct
    )
    Task {
      // End any existing activities first so we don't pile up duplicates
      // (orphans from prior debug starts, hot reloads, interrupted ends).
      for activity in Activity<HydrationActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      do {
        let activity = try Activity<HydrationActivityAttributes>.request(
          attributes: attrs,
          content: .init(state: state, staleDate: nil)
        )
        resolve(activity.id)
      } catch {
        reject("START_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(updateActivity:goalOz:resolver:rejecter:)
  func updateActivity(hydrationOz: Double,
                      goalOz: Double,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject:  @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.2, *) else { resolve(false); return }
    let pct = goalOz > 0 ? hydrationOz / goalOz : 0
    let state = HydrationActivityAttributes.ContentState(
      hydrationOz: hydrationOz, goalOz: goalOz, pct: pct
    )
    Task {
      let activities = Activity<HydrationActivityAttributes>.activities
      for activity in activities {
        await activity.update(.init(state: state, staleDate: nil))
      }
      resolve(!activities.isEmpty)
    }
  }

  @objc(endActivity:rejecter:)
  func endActivity(_ resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.2, *) else { resolve(false); return }
    Task {
      let activities = Activity<HydrationActivityAttributes>.activities
      for activity in activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      resolve(!activities.isEmpty)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
`.trimStart();

// ─── ObjC bridge ──────────────────────────────────────────────────────────────

const OBJC_SOURCE = `
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LLLiveActivity, NSObject)

RCT_EXTERN_METHOD(startActivity:(double)hydrationOz
                  goalOz:(double)goalOz
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(double)hydrationOz
                  goalOz:(double)goalOz
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`.trimStart();

const SWIFT_FILENAME = 'LLLiveActivity.swift';
const OBJC_FILENAME  = 'LLLiveActivity.m';

// ─── Step 1: write files into ios/ ────────────────────────────────────────────
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

// ─── Step 2: add to main Xcode target ─────────────────────────────────────────
function withAddToXcode(config) {
  return withXcodeProject(config, (config) => {
    const project     = config.modResults;
    const projectName = config.modRequest.projectName;

    const groups = project.hash.project.objects['PBXGroup'] || {};
    const mainGroupKey = Object.keys(groups).find(
      (key) => !key.endsWith('_comment') && groups[key].name === projectName,
    );

    [SWIFT_FILENAME, OBJC_FILENAME].forEach((filename) => {
      if (!project.hasFile(filename)) {
        project.addSourceFile(filename, {}, mainGroupKey);
      }
    });

    return config;
  });
}

// ─── Step 3: flip NSSupportsLiveActivities on the main app ────────────────────
function withSupportsLiveActivities(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });
}

module.exports = function withLiveActivity(config) {
  config = withWriteNativeFiles(config);
  config = withAddToXcode(config);
  config = withSupportsLiveActivities(config);
  return config;
};
