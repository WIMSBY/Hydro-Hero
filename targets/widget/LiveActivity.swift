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

// MARK: - Live Activity Widget

@available(iOS 16.2, *)
struct HydrationLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HydrationActivityAttributes.self) { context in
            HydrationLockScreenView(state: context.state)
                .activityBackgroundTint(appBg)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    FilledWaterDrop(pct: context.state.pct, size: 44)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(pctInt(context.state.pct))%")
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundColor(gold)
                        Text(remainingText(context.state))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white.opacity(0.7))
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
                                .frame(width: geo.size.width * CGFloat(min(context.state.pct, 1.0)),
                                       height: 4)
                        }
                    }
                    .frame(height: 4)
                    .padding(.horizontal, 4)
                    .padding(.top, 2)
                }
            } compactLeading: {
                FilledWaterDrop(pct: context.state.pct, size: 20)
            } compactTrailing: {
                Text("\(pctInt(context.state.pct))%")
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .foregroundColor(gold)
            } minimal: {
                FilledWaterDrop(pct: context.state.pct, size: 18)
            }
            .widgetURL(URL(string: "hydrationstation://"))
            .keylineTint(waterBlue)
        }
    }
}
