import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - ActivityAttributes
//
// The ContentState shape MUST stay byte-identical to the duplicate struct in
// the main app's LLLiveActivity.swift (written by plugins/withLiveActivity.js).
// ActivityKit matches activities across processes by attribute type name +
// Codable shape, so any drift here silently breaks update() and end() calls
// from JS.

struct HydrationActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var hydrationOz: Double
        var goalOz: Double
        var pct: Double
    }
    var startedAt: Date
}

// MARK: - Helpers

private func pctInt(_ pct: Double) -> Int {
    min(Int((pct * 100).rounded()), 999)
}

private func remainingText(_ s: HydrationActivityAttributes.ContentState) -> String {
    let remaining = max(s.goalOz - s.hydrationOz, 0)
    if remaining <= 0 { return "Goal hit! 🎯" }
    return String(format: "%.1f oz to go", remaining)
}

// MARK: - Lock Screen / Banner

@available(iOS 16.2, *)
struct HydrationLockScreenView: View {
    let state: HydrationActivityAttributes.ContentState
    var body: some View {
        HStack(spacing: 14) {
            FilledWaterDrop(pct: state.pct, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(pctInt(state.pct))%")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                    .foregroundColor(gold)
                Text(remainingText(state))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("HYDRO HERO")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(gold.opacity(0.6))
                    .kerning(1.4)
                Text(String(format: "%.0f / %.0f oz", state.hydrationOz, state.goalOz))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.6))
            }
        }
        .padding(14)
    }
}

// Rendered when ActivityKit flags the content stale — set by the app to the
// next local midnight so the Lock Screen doesn't display yesterday's fill
// after date rollover when the phone slept through the app's midnight timer.
@available(iOS 16.2, *)
struct HydrationStaleLockScreenView: View {
    var body: some View {
        HStack(spacing: 14) {
            FilledWaterDrop(pct: 0, size: 52)
                .opacity(0.55)
            VStack(alignment: .leading, spacing: 2) {
                Text("New day")
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundColor(gold)
                Text("Open Hydro Hero to track today")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
            }
            Spacer()
            Text("HYDRO HERO")
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(gold.opacity(0.6))
                .kerning(1.4)
        }
        .padding(14)
    }
}

// MARK: - Live Activity Widget

@available(iOS 16.2, *)
struct HydrationLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HydrationActivityAttributes.self) { context in
            Group {
                if context.isStale {
                    HydrationStaleLockScreenView()
                } else {
                    HydrationLockScreenView(state: context.state)
                }
            }
            .activityBackgroundTint(appBg)
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            // Once stale (past midnight rollover with no app update), hide the
            // pct display so it doesn't lie about today; show a neutral "new
            // day" cue instead. Compact + minimal show a dimmed empty drop.
            let stale = context.isStale
            let displayPct = stale ? 0.0 : context.state.pct
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    FilledWaterDrop(pct: displayPct, size: 44)
                        .opacity(stale ? 0.55 : 1.0)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        if stale {
                            Text("New day")
                                .font(.system(size: 22, weight: .black, design: .rounded))
                                .foregroundColor(gold)
                            Text("Open Hydro Hero")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white.opacity(0.7))
                        } else {
                            Text("\(pctInt(context.state.pct))%")
                                .font(.system(size: 28, weight: .black, design: .rounded))
                                .foregroundColor(gold)
                            Text(remainingText(context.state))
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.12))
                                .frame(height: 4)
                            Capsule()
                                .fill(gold)
                                .frame(width: geo.size.width * CGFloat(min(displayPct, 1.0)),
                                       height: 4)
                        }
                    }
                    .frame(height: 4)
                    .padding(.horizontal, 4)
                    .padding(.top, 2)
                }
            } compactLeading: {
                FilledWaterDrop(pct: displayPct, size: 20)
                    .opacity(stale ? 0.55 : 1.0)
            } compactTrailing: {
                if stale {
                    Text("💧")
                        .font(.system(size: 13, weight: .black, design: .rounded))
                } else {
                    Text("\(pctInt(context.state.pct))%")
                        .font(.system(size: 13, weight: .black, design: .rounded))
                        .foregroundColor(gold)
                }
            } minimal: {
                FilledWaterDrop(pct: displayPct, size: 18)
                    .opacity(stale ? 0.55 : 1.0)
            }
            .widgetURL(URL(string: "hydrationstation://"))
            .keylineTint(waterBlue)
        }
    }
}
