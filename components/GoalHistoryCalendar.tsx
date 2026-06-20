import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BEVERAGES, type BevCategory } from '../constants/beverages';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getDayColor(pct: number | undefined): string {
  if (pct === undefined) return 'transparent';
  if (pct >= 1.0) return '#0D6EE8';
  if (pct >= 0.75) return '#1E9E4A';
  if (pct >= 0.50) return '#E8920A';
  if (pct >= 0.25) return '#D94E00';
  if (pct > 0) return '#C0152A';
  return 'transparent';
}

function getDateKey(d: Date) {
  return `water_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

function formatDate(dateStr: string) {
  const [, y, m, d] = dateStr.split('_');
  return `${m}/${d}/${y}`;
}

interface HistoryEntry {
  date: string;
  oz: number;
  goal: number;
  breakdown?: Record<BevCategory, number>;
}

interface Props {
  goalHistory: Record<string, number>;
  history: HistoryEntry[];
  /** Horizontal padding the calendar should subtract from screen width. Default 48 (24*2). */
  outerPadding?: number;
}

export default function GoalHistoryCalendar({ goalHistory, history, outerPadding = 48 }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    if (isCurrentMonth) return;
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDOW = new Date(viewYear, viewMonth, 1).getDay();
  type DayItem = { date: Date; key: string } | null;
  const cells: DayItem[] = [
    ...Array(firstDOW).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(viewYear, viewMonth, i + 1);
      return { date: d, key: getDateKey(d) };
    }),
  ];

  const streak = useMemo(() => {
    let s = 0;
    const base = new Date();
    for (let i = 0; i <= 365; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      if ((goalHistory[getDateKey(d)] ?? 0) >= 1.0) s++;
      else break;
    }
    return s;
  }, [goalHistory]);

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const selectedEntry = selectedDate ? history.find((h) => h.date === selectedDate) : null;
  const selectedPct = selectedDate ? (goalHistory[selectedDate] ?? 0) : 0;

  const { width: screenWidth } = useWindowDimensions();
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const GAP = 4;
  const CELL = Math.max(34, Math.floor((screenWidth - outerPadding) / 7) - GAP);

  return (
    <View style={s.wrapper}>
      <View style={s.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
          <Text style={s.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={[s.navBtn, isCurrentMonth && { opacity: 0.3 }]} disabled={isCurrentMonth}>
          <Text style={s.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={s.streakRow}>
        <Text style={s.streakText}>
          {streak > 0 ? `🔥 ${streak} Day Streak!` : 'Start your streak today! 💧'}
        </Text>
      </View>

      <View style={s.dowRow}>
        {DOW.map((d) => (
          <Text key={d} style={[s.dowLabel, { width: CELL, marginHorizontal: GAP / 2 }]}>{d}</Text>
        ))}
      </View>

      <View style={s.grid}>
        {cells.map((item, idx) => {
          if (!item) return <View key={`pad-${idx}`} style={{ width: CELL, height: CELL, margin: GAP / 2 }} />;
          const pct = goalHistory[item.key];
          const bgColor = getDayColor(pct);
          const dayNum = item.date.getDate();
          const isFuture = item.date > today;
          const isToday = item.key === getDateKey(today);
          const hasData = pct !== undefined && !isFuture;
          const isSelected = selectedDate === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => !isFuture && setSelectedDate(isSelected ? null : item.key)}
              activeOpacity={isFuture ? 1 : 0.7}
              style={[
                s.dayCell,
                { width: CELL, height: CELL, margin: GAP / 2, borderRadius: CELL / 2, backgroundColor: hasData ? bgColor : 'transparent' },
                !hasData && !isFuture && { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
                isToday && { borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
                isSelected && { borderWidth: 2.5, borderColor: '#ffffff' },
              ]}
            >
              <Text style={[s.dayNum, { color: isFuture ? 'rgba(255,255,255,0.15)' : hasData ? '#ffffff' : 'rgba(255,255,255,0.35)' }]}>
                {dayNum}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.legendRow}>
        {[
          { color: '#0D6EE8', label: '100%' },
          { color: '#1E9E4A', label: '75%' },
          { color: '#E8920A', label: '50%' },
          { color: '#D94E00', label: '25%' },
          { color: '#C0152A', label: '<25%' },
        ].map(({ color, label }) => (
          <View key={label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: color }]} />
            <Text style={s.legendLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {selectedDate && (
        <View style={s.detailCard}>
          <Text style={s.detailDate}>{formatDate(selectedDate)}</Text>
          <Text style={s.detailItem}>
            {selectedPct >= 1 ? '✅' : '❌'} Hydration: {selectedEntry ? selectedEntry.oz.toFixed(1) : '0'} oz ({Math.round(selectedPct * 100)}%)
          </Text>
          {selectedEntry?.breakdown && BEVERAGES.filter((c) => (selectedEntry.breakdown![c.key] || 0) > 0).map((cat) => (
            <View key={cat.key} style={s.detailBevRow}>
              <View style={[s.detailDot, { backgroundColor: cat.color }]} />
              <Text style={s.detailBevLabel}>{cat.label}</Text>
              <Text style={s.detailBevOz}>{(selectedEntry.breakdown![cat.key] || 0).toFixed(1)} oz</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { padding: 6 },
  navArrow: { fontSize: 28, color: '#ffffff', fontWeight: '300', lineHeight: 30 },
  monthTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  streakRow: { marginBottom: 10 },
  streakText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 11, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 10, color: 'rgba(255,255,255,0.75)' },
  detailCard: { marginTop: 12, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 12 },
  detailDate: { color: '#ffffff', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  detailItem: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 2 },
  detailBevRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  detailDot: { width: 8, height: 8, borderRadius: 4 },
  detailBevLabel: { flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  detailBevOz: { fontSize: 11, color: '#ffffff', fontWeight: '600' },
});
