import SwiftUI
import WatchConnectivity

// ─── Design tokens (matching iOS app) ────────────────────────────────────────

private let appBg     = Color(red: 10/255,  green: 5/255,   blue: 32/255)
private let gold      = Color(red: 255/255, green: 215/255, blue: 0/255)
private let waterBlue = Color(red: 0/255,   green: 136/255, blue: 255/255)

// ─── Beverage catalog (mirror of constants/beverages.ts) ─────────────────────

struct BevDef: Hashable {
    let key: String
    let label: String
    let emoji: String
}

private let WATCH_BEVERAGES: [BevDef] = [
    BevDef(key: "water",      label: "Water",          emoji: "💧"),
    BevDef(key: "coffee",     label: "Coffee",         emoji: "☕"),
    BevDef(key: "tea",        label: "Tea",            emoji: "🍵"),
    BevDef(key: "icedtea",    label: "Iced Tea",       emoji: "🧋"),
    BevDef(key: "soda",       label: "Soda",           emoji: "🥤"),
    BevDef(key: "flavored",   label: "Flavored Water", emoji: "🫧"),
    BevDef(key: "coconut",    label: "Coconut Water",  emoji: "🥥"),
    BevDef(key: "juice",      label: "Juice",          emoji: "🍊"),
    BevDef(key: "lemonade",   label: "Lemonade",       emoji: "🍋"),
    BevDef(key: "fruit",      label: "Fruit Drinks",   emoji: "🍹"),
    BevDef(key: "sports",     label: "Sports Drink",   emoji: "🏃"),
    BevDef(key: "milk",       label: "Milk",           emoji: "🥛"),
    BevDef(key: "protein",    label: "Protein Shake",  emoji: "💪"),
    BevDef(key: "beer",       label: "Beer",           emoji: "🍺"),
    BevDef(key: "wine",       label: "Wine",           emoji: "🍷"),
    BevDef(key: "cocktail",   label: "Cocktail",       emoji: "🍸"),
    BevDef(key: "energy",     label: "Energy Drink",   emoji: "⚡"),
    BevDef(key: "energyshot", label: "Energy Shot",    emoji: "🔋"),
    BevDef(key: "hotchoc",    label: "Hot Chocolate",  emoji: "🍫"),
    BevDef(key: "spirits",    label: "Spirits",        emoji: "🥃"),
]

private func bevByKey(_ key: String) -> BevDef {
    WATCH_BEVERAGES.first { $0.key == key }
        ?? BevDef(key: key, label: key.capitalized, emoji: "🥤")
}

/// Categories shown in the Watch picker: the user's `selectedBeverages` from
/// the iPhone, in the same order as the master catalog. Falls back to water
/// alone if the phone hasn't pushed a selection yet.
private func categoriesFor(_ selected: [String]) -> [BevDef] {
    let set = Set(selected)
    let filtered = WATCH_BEVERAGES.filter { set.contains($0.key) }
    return filtered.isEmpty ? [bevByKey("water")] : filtered
}

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

enum LogStep: Equatable {
    case category                 // pick beverage
    case amount(BevDef)           // pick preset oz
    case custom(BevDef)           // dial in oz via Digital Crown
}

enum AmountUnit { case oz, ml }

private let ML_PER_OZ: Double = 29.5735

struct ContentView: View {
    @EnvironmentObject var wcm: WatchConnectivityManager
    @State private var showConfirmation = false
    @State private var confirmMsg = ""
    @State private var logStep: LogStep? = nil

    var state: HydrationState { wcm.state }

    var body: some View {
        ZStack {
            appBg.ignoresSafeArea()

            if showConfirmation {
                ConfirmationView(message: confirmMsg)
                    .transition(.opacity)
            } else if let step = logStep {
                switch step {
                case .category:
                    CategoryPickerView(
                        categories: categoriesFor(state.selectedBeverages),
                        onSelect: { cat in withAnimation { logStep = .amount(cat) } },
                        onCancel: { withAnimation { logStep = nil } }
                    )
                    .transition(.move(edge: .bottom))
                case .amount(let cat):
                    AmountPickerView(
                        category: cat,
                        onLog: { oz in handleLog(amount: oz, category: cat.key) },
                        onCustom: { withAnimation { logStep = .custom(cat) } },
                        onBack: { withAnimation { logStep = .category } }
                    )
                    .transition(.opacity)
                case .custom(let cat):
                    CustomAmountView(
                        category: cat,
                        onLog: { oz in handleLog(amount: oz, category: cat.key) },
                        onBack: { withAnimation { logStep = .amount(cat) } }
                    )
                    .transition(.opacity)
                }
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
                    Text("HYDRO HERO")
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
                    withAnimation { logStep = .category }
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
        withAnimation { logStep = nil }
        wcm.sendLogDrink(amount: amount, category: category)
        // Show local confirmation immediately. transferUserInfo is fire-and-forget
        // so there's no reply to confirm delivery — confirmation is best-effort.
        confirmMsg = String(format: "+%.0f oz logged!", amount)
        withAnimation { showConfirmation = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            withAnimation { showConfirmation = false }
        }
    }
}

// ─── Category Picker ──────────────────────────────────────────────────────────

struct CategoryPickerView: View {
    let categories: [BevDef]
    let onSelect: (BevDef) -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            appBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 6) {
                    Text("LOG A DRINK")
                        .font(.system(size: 10, weight: .black))
                        .foregroundColor(gold)
                        .kerning(1.2)
                        .padding(.top, 4)
                        .padding(.bottom, 2)

                    ForEach(categories, id: \.key) { cat in
                        Button {
                            onSelect(cat)
                        } label: {
                            HStack(spacing: 8) {
                                Text(cat.emoji)
                                    .font(.system(size: 18))
                                Text(cat.label)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.white.opacity(0.08))
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    }

                    Button("Cancel") { onCancel() }
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .padding(.top, 6)
                }
                .padding(.horizontal, 6)
                .padding(.bottom, 8)
            }
        }
    }
}

// ─── Amount Picker ────────────────────────────────────────────────────────────

struct AmountPickerView: View {
    let category: BevDef
    let onLog: (Double) -> Void
    let onCustom: () -> Void
    let onBack: () -> Void

    var body: some View {
        ZStack {
            appBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Text(category.emoji)
                            .font(.system(size: 14))
                        Text(category.label.uppercased())
                            .font(.system(size: 10, weight: .black))
                            .foregroundColor(.white.opacity(0.8))
                            .kerning(1)
                    }
                    .padding(.top, 4)

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        QuickLogButton(label: "8",  amount: 8,  category: category.key) { oz, _ in onLog(oz) }
                        QuickLogButton(label: "12", amount: 12, category: category.key) { oz, _ in onLog(oz) }
                        QuickLogButton(label: "16", amount: 16, category: category.key) { oz, _ in onLog(oz) }
                        QuickLogButton(label: "24", amount: 24, category: category.key) { oz, _ in onLog(oz) }
                    }

                    // Bottled water is overwhelmingly 16.9 oz — give it a
                    // dedicated single-tap entry on the Water category.
                    if category.key == "water" {
                        Button { onLog(16.9) } label: {
                            HStack(spacing: 6) {
                                Text("🧴")
                                    .font(.system(size: 14))
                                Text("Bottle")
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundColor(.black)
                                Text("16.9 oz")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(.black.opacity(0.6))
                            }
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(gold)
                            .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    }

                    Button(action: onCustom) {
                        Text("Custom oz…")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(Color.white.opacity(0.15))
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)

                    Button("Back") { onBack() }
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .padding(.top, 2)
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
        }
    }
}

// ─── Custom Amount (Digital Crown) ────────────────────────────────────────────

struct CustomAmountView: View {
    let category: BevDef
    let onLog: (Double) -> Void   // always receives oz
    let onBack: () -> Void

    @State private var amount: Double = 8       // value in current unit
    @State private var unit: AmountUnit = .oz
    @State private var showNumberPad = false
    @FocusState private var crownFocused: Bool

    // Crown range adapts to the chosen unit.
    private var crownFrom: Double    { unit == .oz ? 1   : 10 }
    private var crownThrough: Double { unit == .oz ? 128 : 2000 }
    private var crownBy: Double      { unit == .oz ? 1   : 10 }

    var body: some View {
        ZStack {
            appBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 4) {
                    Text(category.emoji)
                        .font(.system(size: 18))
                        .padding(.top, 2)

                    // Crown-controlled big readout. Range depends on unit;
                    // forcing a new id on unit change makes SwiftUI rebuild the
                    // modifier so the new from/through actually take effect.
                    Text("\(Int(amount))")
                        .font(.system(size: 32, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                        .focusable()
                        .focused($crownFocused)
                        .digitalCrownRotation(
                            $amount,
                            from: crownFrom,
                            through: crownThrough,
                            by: crownBy,
                            sensitivity: .medium,
                            isContinuous: false,
                            isHapticFeedbackEnabled: true
                        )
                        .id(unit)

                    // Unit toggle (replaces the static "oz" caption).
                    HStack(spacing: 3) {
                        unitPill("oz", isOn: unit == .oz) { setUnit(.oz) }
                        unitPill("mL", isOn: unit == .ml) { setUnit(.ml) }
                    }
                    .frame(maxWidth: 110)
                    .padding(.top, 2)

                    // Opens a custom number pad — watchOS has no system numeric
                    // keypad, so we present our own to avoid the full keyboard.
                    Button {
                        showNumberPad = true
                    } label: {
                        Text("Tap to type")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white.opacity(0.9))
                            .frame(maxWidth: .infinity, minHeight: 28)
                            .background(Color.white.opacity(0.15))
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 4)
                    .padding(.top, 4)

                    HStack(spacing: 6) {
                        Button("Back") { onBack() }
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                            .frame(maxWidth: .infinity, minHeight: 32)
                            .background(Color.white.opacity(0.1))
                            .cornerRadius(8)
                            .buttonStyle(.plain)

                        Button {
                            let oz = unit == .ml ? amount / ML_PER_OZ : amount
                            onLog(max(1, oz))
                        } label: {
                            Text("Log")
                                .font(.system(size: 12, weight: .black))
                                .foregroundColor(.black)
                                .frame(maxWidth: .infinity, minHeight: 32)
                                .background(gold)
                                .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
            }
            .onAppear { crownFocused = true }
        }
        .sheet(isPresented: $showNumberPad) {
            NumberPadView(unit: unit) { newValue in
                amount = newValue
                showNumberPad = false
            } onCancel: {
                showNumberPad = false
            }
        }
    }

    private func setUnit(_ newUnit: AmountUnit) {
        guard newUnit != unit else { return }
        // Convert current amount so the displayed quantity stays equivalent.
        amount = newUnit == .ml ? (amount * ML_PER_OZ).rounded()
                                : (amount / ML_PER_OZ).rounded()
        unit = newUnit
        // Clamp to the new Crown range so the value isn't out of bounds.
        let lo: Double = newUnit == .oz ? 1 : 10
        let hi: Double = newUnit == .oz ? 128 : 2000
        amount = min(max(amount, lo), hi)
    }

    private func unitPill(_ label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 11, weight: .black))
                .foregroundColor(isOn ? .black : .white.opacity(0.7))
                .frame(maxWidth: .infinity, minHeight: 22)
                .background(isOn ? gold : Color.white.opacity(0.12))
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }
}

// ─── Custom Number Pad ────────────────────────────────────────────────────────

struct NumberPadView: View {
    let unit: AmountUnit
    let onDone: (Double) -> Void
    let onCancel: () -> Void

    @State private var entry: String = ""

    var body: some View {
        ZStack {
            appBg.ignoresSafeArea()

            VStack(spacing: 4) {
                Text(entry.isEmpty ? "0" : entry)
                    .font(.system(size: 22, weight: .black, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.top, 4)
                Text(unit == .oz ? "oz" : "mL")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundColor(.white.opacity(0.5))

                // 3×3 digits + a wider 0 / backspace row
                VStack(spacing: 3) {
                    HStack(spacing: 3) { numKey("1"); numKey("2"); numKey("3") }
                    HStack(spacing: 3) { numKey("4"); numKey("5"); numKey("6") }
                    HStack(spacing: 3) { numKey("7"); numKey("8"); numKey("9") }
                    HStack(spacing: 3) {
                        numKey("0")
                        numKey("⌫") {
                            if !entry.isEmpty { entry.removeLast() }
                        }
                    }
                }
                .padding(.horizontal, 2)
                .padding(.top, 2)

                HStack(spacing: 4) {
                    Button("Cancel") { onCancel() }
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                        .frame(maxWidth: .infinity, minHeight: 26)
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(6)
                        .buttonStyle(.plain)

                    Button {
                        if let v = Int(entry), v > 0 {
                            onDone(Double(v))
                        } else {
                            onCancel()
                        }
                    } label: {
                        Text("Done")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(.black)
                            .frame(maxWidth: .infinity, minHeight: 26)
                            .background(gold)
                            .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 2)
                .padding(.top, 3)
            }
            .padding(.horizontal, 4)
            .padding(.bottom, 4)
        }
    }

    // Default action: append the label to the entry.
    private func numKey(_ label: String) -> some View {
        numKey(label) { entry.append(label) }
    }

    private func numKey(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 26)
                .background(Color.white.opacity(0.18))
                .cornerRadius(5)
        }
        .buttonStyle(.plain)
    }
}
