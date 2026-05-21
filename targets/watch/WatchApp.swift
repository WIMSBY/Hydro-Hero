import SwiftUI
import WatchConnectivity

// ─── Design tokens (matching iOS app) ────────────────────────────────────────

private let appBg     = Color(red: 10/255,  green: 5/255,   blue: 32/255)
private let gold      = Color(red: 255/255, green: 215/255, blue: 0/255)
private let waterBlue = Color(red: 0/255,   green: 136/255, blue: 255/255)

// ─── App Entry Point ──────────────────────────────────────────────────────────

@main
struct LiquidLuckWatchApp: App {
    @StateObject private var wcm = WatchConnectivityManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(wcm)
        }
    }
}

// ─── Water Drop Shape ─────────────────────────────────────────────────────────

struct WaterDropShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        var p = Path()
        p.move(to: CGPoint(x: w * 0.5, y: 0))
        p.addCurve(to: CGPoint(x: w,       y: h * 0.65),
                   control1: CGPoint(x: w * 0.85, y: h * 0.12),
                   control2: CGPoint(x: w,         y: h * 0.42))
        p.addCurve(to: CGPoint(x: w * 0.5, y: h),
                   control1: CGPoint(x: w,         y: h * 0.92),
                   control2: CGPoint(x: w * 0.78,  y: h))
        p.addCurve(to: CGPoint(x: 0,       y: h * 0.65),
                   control1: CGPoint(x: w * 0.22,  y: h),
                   control2: CGPoint(x: 0,          y: h * 0.92))
        p.addCurve(to: CGPoint(x: w * 0.5, y: 0),
                   control1: CGPoint(x: 0,          y: h * 0.42),
                   control2: CGPoint(x: w * 0.15,   y: h * 0.12))
        p.closeSubpath()
        return p
    }
}

// ─── Filled Water Drop ────────────────────────────────────────────────────────

struct FilledWaterDrop: View {
    let pct: Double
    let size: CGFloat

    var body: some View {
        ZStack {
            WaterDropShape()
                .fill(Color.white.opacity(0.08))
                .frame(width: size, height: size)
            WaterDropShape()
                .fill(waterBlue)
                .frame(width: size, height: size)
                .mask(alignment: .bottom) {
                    Rectangle()
                        .frame(height: size * CGFloat(min(pct, 1.0)))
                }
            WaterDropShape()
                .stroke(Color.white.opacity(0.25), lineWidth: 1)
                .frame(width: size, height: size)
        }
    }
}

// ─── Quick Log Button ─────────────────────────────────────────────────────────

struct QuickLogButton: View {
    let label: String
    let amount: Double
    let category: String
    let action: (Double, String) -> Void

    var body: some View {
        Button {
            action(amount, category)
        } label: {
            VStack(spacing: 2) {
                Text(label)
                    .font(.system(size: 14, weight: .black, design: .rounded))
                    .foregroundColor(.black)
                Text("oz")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(.black.opacity(0.6))
            }
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(gold)
            .cornerRadius(8)
        }
        .buttonStyle(.plain)
    }
}

// ─── Confirmation Flash ───────────────────────────────────────────────────────

struct ConfirmationView: View {
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Text("💧")
                .font(.system(size: 36))
            Text(message)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(gold)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(appBg)
    }
}

// ─── Main Content View ────────────────────────────────────────────────────────

struct ContentView: View {
    @EnvironmentObject var wcm: WatchConnectivityManager
    @State private var showConfirmation = false
    @State private var confirmMsg = ""
    @State private var showQuickLog = false

    var state: HydrationState { wcm.state }

    var body: some View {
        ZStack {
            appBg.ignoresSafeArea()

            if showConfirmation {
                ConfirmationView(message: confirmMsg)
                    .transition(.opacity)
            } else if showQuickLog {
                QuickLogView(
                    onLog: handleLog,
                    onCancel: { withAnimation { showQuickLog = false } }
                )
                .transition(.move(edge: .bottom))
            } else {
                mainView
            }
        }
        .onChange(of: wcm.lastLogConfirmation) { confirmation in
            if let conf = confirmation {
                confirmMsg = conf
                withAnimation { showConfirmation = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    withAnimation { showConfirmation = false }
                    wcm.lastLogConfirmation = nil
                }
            }
        }
    }

    // MARK: – Main hydration view

    private var mainView: some View {
        ScrollView {
            VStack(spacing: 10) {

                // Header
                HStack(spacing: 4) {
                    Text("💧")
                        .font(.system(size: 11))
                    Text("LIQUID LUCK")
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(gold)
                        .kerning(1.5)
                }
                .padding(.top, 6)

                // Water drop + percentage
                ZStack {
                    FilledWaterDrop(pct: state.pct, size: 56)

                    Text("\(state.displayPct)%")
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .shadow(color: .black.opacity(0.8), radius: 2)
                }

                // Status
                if state.goalHit {
                    Text("🎰 JACKPOT!")
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(gold)
                } else {
                    Text(String(format: "%.0f oz to go", state.remainingOz))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))
                }

                // Stats row
                HStack(spacing: 12) {
                    statCell(label: "TODAY", value: String(format: "%.0f oz", state.hydrationOz))
                    statCell(label: "GOAL",  value: String(format: "%.0f oz", state.goalOz))
                    if state.streak > 0 {
                        statCell(label: "STREAK", value: "\(state.streak)🔥")
                    }
                }

                // Log button
                Button {
                    withAnimation { showQuickLog = true }
                } label: {
                    HStack(spacing: 4) {
                        Text("+")
                            .font(.system(size: 18, weight: .black))
                        Text("Log Drink")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(.black)
                    .frame(maxWidth: .infinity, minHeight: 38)
                    .background(gold)
                    .cornerRadius(10)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 12)
        }
    }

    // MARK: – Stat cell

    private func statCell(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 7, weight: .bold))
                .foregroundColor(gold.opacity(0.65))
                .kerning(0.5)
            Text(value)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
    }

    // MARK: – Handle log

    private func handleLog(amount: Double, category: String) {
        withAnimation { showQuickLog = false }
        wcm.sendLogDrink(amount: amount, category: category)
        // Show local confirmation immediately; phone reply updates it if reachable
        confirmMsg = String(format: "+%.0f oz logged!", amount)
        withAnimation { showConfirmation = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            withAnimation { showConfirmation = false }
        }
    }
}

// ─── Quick Log Sheet ──────────────────────────────────────────────────────────

struct QuickLogView: View {
    let onLog: (Double, String) -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            appBg.ignoresSafeArea()

            VStack(spacing: 8) {
                Text("Log Water")
                    .font(.system(size: 13, weight: .black))
                    .foregroundColor(gold)
                    .padding(.top, 4)

                // 2×2 quick amounts
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    QuickLogButton(label: "8",  amount: 8,  category: "water", action: onLog)
                    QuickLogButton(label: "12", amount: 12, category: "water", action: onLog)
                    QuickLogButton(label: "16", amount: 16, category: "water", action: onLog)
                    QuickLogButton(label: "24", amount: 24, category: "water", action: onLog)
                }

                Button("Cancel") { onCancel() }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                    .padding(.top, 2)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
        }
    }
}
