import WidgetKit
import SwiftUI

// MARK: - Shared App Group ID
private let appGroupID = "group.com.wimsby.hydrationstation"

// MARK: - Timeline Entry
struct HydrationEntry: TimelineEntry {
    let date: Date
    let hydrationOz: Double
    let goalOz: Double
    let pct: Double           // hydrationOz / goalOz, unbounded

    var goalHit: Bool      { pct >= 1.0 }
    var remainingOz: Double { max(goalOz - hydrationOz, 0) }
    var displayPct: Int    { min(Int(pct * 100), 999) }
}

// MARK: - Timeline Provider
struct HydrationProvider: TimelineProvider {

    func placeholder(in context: Context) -> HydrationEntry {
        HydrationEntry(date: Date(), hydrationOz: 42, goalOz: 64, pct: 0.65)
    }

    func getSnapshot(in context: Context, completion: @escaping (HydrationEntry) -> Void) {
        completion(readEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HydrationEntry>) -> Void) {
        let entry = readEntry()
        let calendar = Calendar.current
        let now = Date()
        let hour = calendar.component(.hour, from: now)

        let nextUpdate: Date
        if hour >= 6 && hour < 24 {
            // During waking hours: refresh every 15 minutes
            nextUpdate = calendar.date(byAdding: .minute, value: 15, to: now) ?? now
        } else {
            // Outside waking hours: wake at 6 am
            var comps = calendar.dateComponents([.year, .month, .day], from: now)
            comps.hour = 6; comps.minute = 0; comps.second = 0
            var wake = calendar.date(from: comps) ?? now
            if wake <= now {
                wake = calendar.date(byAdding: .day, value: 1, to: wake) ?? now
            }
            nextUpdate = wake
        }

        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    // MARK: Read from shared App Group UserDefaults
    private func readEntry() -> HydrationEntry {
        let d = UserDefaults(suiteName: appGroupID)
        let hydOz  = d?.double(forKey: "hydrationOz") ?? 0
        let goalOz = d?.double(forKey: "goalOz") ?? 64
        let pct    = goalOz > 0 ? hydOz / goalOz : 0
        return HydrationEntry(date: Date(), hydrationOz: hydOz, goalOz: goalOz, pct: pct)
    }
}

// MARK: - Design Tokens
private let appBg    = Color(red: 10/255,  green: 5/255,   blue: 32/255)
private let gold     = Color(red: 255/255, green: 215/255, blue: 0/255)
private let waterBlue = Color(red: 0/255,  green: 136/255, blue: 255/255)

// MARK: - Water Drop Shape
struct WaterDropShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        var p = Path()
        p.move(to: CGPoint(x: w * 0.5, y: 0))
        p.addCurve(to: CGPoint(x: w,   y: h * 0.65),
                   control1: CGPoint(x: w * 0.85, y: h * 0.12),
                   control2: CGPoint(x: w,         y: h * 0.42))
        p.addCurve(to: CGPoint(x: w * 0.5, y: h),
                   control1: CGPoint(x: w,    y: h * 0.92),
                   control2: CGPoint(x: w * 0.78, y: h))
        p.addCurve(to: CGPoint(x: 0,   y: h * 0.65),
                   control1: CGPoint(x: w * 0.22, y: h),
                   control2: CGPoint(x: 0,         y: h * 0.92))
        p.addCurve(to: CGPoint(x: w * 0.5, y: 0),
                   control1: CGPoint(x: 0,         y: h * 0.42),
                   control2: CGPoint(x: w * 0.15,  y: h * 0.12))
        p.closeSubpath()
        return p
    }
}

// MARK: - Filled Water Drop
struct FilledWaterDrop: View {
    let pct: Double
    let size: CGFloat

    var body: some View {
        ZStack {
            // Outline shell
            WaterDropShape()
                .fill(Color.white.opacity(0.08))
                .frame(width: size, height: size)

            // Filled portion (bottom-up)
            WaterDropShape()
                .fill(waterBlue)
                .frame(width: size, height: size)
                .mask(alignment: .bottom) {
                    Rectangle()
                        .frame(height: size * CGFloat(min(pct, 1.0)))
                }

            // Shine highlight
            WaterDropShape()
                .stroke(Color.white.opacity(0.25), lineWidth: 1)
                .frame(width: size, height: size)
        }
    }
}

// MARK: - Small Widget (2×2)
struct SmallView: View {
    let entry: HydrationEntry

    var body: some View {
        ZStack {
            appBg
            VStack(spacing: 3) {
                // Large percentage
                Text("\(entry.displayPct)%")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .foregroundColor(gold)
                    .minimumScaleFactor(0.4)
                    .lineLimit(1)

                // Water drop fill visualization
                FilledWaterDrop(pct: entry.pct, size: 44)

                // Status line
                if entry.goalHit {
                    Text("🎰 JACKPOT!")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(gold)
                } else {
                    Text("\(Int(entry.remainingOz)) oz to go")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.65))
                }

                // App name
                Text("LIQUID LUCK")
                    .font(.system(size: 7, weight: .bold))
                    .foregroundColor(gold.opacity(0.5))
                    .kerning(1.2)
            }
            .padding(10)
        }
    }
}

// MARK: - Medium Widget (4×2)
struct MediumView: View {
    let entry: HydrationEntry

    var body: some View {
        ZStack {
            appBg

            HStack(spacing: 0) {

                // ── LEFT: percentage + subtitle ──
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(entry.displayPct)%")
                        .font(.system(size: 40, weight: .black, design: .rounded))
                        .foregroundColor(gold)
                        .minimumScaleFactor(0.4)
                        .lineLimit(1)
                    Text("hydrated")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                    Spacer()
                    Text("LIQUID LUCK")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundColor(gold.opacity(0.45))
                        .kerning(1.2)
                }
                .frame(width: 88, alignment: .leading)
                .padding(.leading, 14)

                Spacer()

                // ── CENTER: vertical progress bar ──
                GeometryReader { geo in
                    let barH = geo.size.height
                    let fillH = barH * CGFloat(min(entry.pct, 1.0))

                    ZStack(alignment: .bottom) {
                        // Track
                        RoundedRectangle(cornerRadius: 5)
                            .fill(Color.white.opacity(0.10))
                            .frame(width: 14, height: barH)

                        // Fill
                        RoundedRectangle(cornerRadius: 5)
                            .fill(
                                LinearGradient(
                                    colors: [waterBlue, waterBlue.opacity(0.55)],
                                    startPoint: .top, endPoint: .bottom
                                )
                            )
                            .frame(width: 14, height: max(fillH, 4))

                        // Goal markers at 25 / 50 / 75 / 100 %
                        ForEach([0.25, 0.5, 0.75, 1.0], id: \.self) { mark in
                            Rectangle()
                                .fill(gold.opacity(0.55))
                                .frame(width: 20, height: 1)
                                .offset(y: -barH * CGFloat(mark) + (mark == 1.0 ? 1 : 0))
                        }
                    }
                    .frame(width: 20)
                    .frame(maxWidth: .infinity)
                }
                .frame(width: 28)
                .padding(.vertical, 14)

                Spacer()

                // ── RIGHT: stat rows ──
                VStack(alignment: .leading, spacing: 8) {
                    StatRow(label: "HYDRATED",
                            value: String(format: "%.1f oz", entry.hydrationOz))

                    if entry.goalHit {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("JACKPOT! 🎰")
                                .font(.system(size: 13, weight: .black))
                                .foregroundColor(gold)
                        }
                    } else {
                        StatRow(label: "REMAINING",
                                value: String(format: "%.1f oz", entry.remainingOz))
                    }
                }
                .padding(.trailing, 14)
            }
            .padding(.vertical, 12)

            // Bottom gold progress bar
            VStack {
                Spacer()
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.white.opacity(0.06))
                            .frame(height: 3)
                        Rectangle()
                            .fill(gold)
                            .frame(width: geo.size.width * CGFloat(min(entry.pct, 1.0)), height: 3)
                    }
                }
                .frame(height: 3)
                .padding(.horizontal, 14)
                .padding(.bottom, 10)
            }
        }
    }
}

private struct StatRow: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 7, weight: .bold))
                .foregroundColor(gold.opacity(0.65))
                .kerning(0.5)
            Text(value)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Entry View (size dispatch)
struct LiquidLuckEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: HydrationEntry

    var body: some View {
        switch family {
        case .systemSmall:  SmallView(entry: entry)
        case .systemMedium: MediumView(entry: entry)
        default:            SmallView(entry: entry)
        }
    }
}

// MARK: - Widget Configuration
struct LiquidLuckWidget: Widget {
    let kind = "LiquidLuckWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HydrationProvider()) { entry in
            if #available(iOS 17.0, *) {
                LiquidLuckEntryView(entry: entry)
                    .containerBackground(appBg, for: .widget)
            } else {
                LiquidLuckEntryView(entry: entry)
            }
        }
        .configurationDisplayName("Liquid Luck")
        .description("Your daily hydration progress at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Widget Bundle Entry Point
@main
struct LiquidLuckWidgetBundle: WidgetBundle {
    var body: some Widget {
        LiquidLuckWidget()
    }
}
