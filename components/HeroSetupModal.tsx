/**
 * components/HeroSetupModal.tsx
 *
 * Day 3 of the Missions feature. Onboarding sheet that captures the user's
 * Hero name + starter emblem, then auto-starts Origin Story (Hero's Journey
 * Bronze). Opens from a Home CTA when no Hero is saved.
 *
 * Day 5 will extend the picker for cape + mask once mission rewards unlock
 * additional options. For now those default to "cape-classic" / "mask-classic".
 */

import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  DEFAULT_HERO_NAME,
  Hero,
  STARTER_EMBLEMS,
  freshHero,
} from "../constants/hero";

const GOLD = "#FFD700";
const NAVY = "#0a0520";

type Props = {
  visible: boolean;
  initialHero?: Hero | null;
  onClose: () => void;
  onConfirm: (hero: Hero, startedFromSetup: boolean) => void;
};

export function HeroSetupModal({ visible, initialHero, onClose, onConfirm }: Props) {
  const [name, setName] = useState(initialHero?.name ?? "");
  const [emblemId, setEmblemId] = useState<string>(
    initialHero?.emblemId ?? STARTER_EMBLEMS[0].id,
  );

  // Re-seed when the modal opens with a different hero (edit-mode case).
  React.useEffect(() => {
    if (visible) {
      setName(initialHero?.name ?? "");
      setEmblemId(initialHero?.emblemId ?? STARTER_EMBLEMS[0].id);
    }
  }, [visible, initialHero]);

  const editing = !!initialHero;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>{editing ? "EDIT HERO" : "BEGIN YOUR HEROIC JOURNEY"}</Text>
          <Text style={styles.title}>
            {editing ? "Update your Hero" : "Name your Hero"}
          </Text>
          {!editing && (
            <Text style={styles.subhead}>
              Your first mission is <Text style={styles.subheadAccent}>Origin Story</Text> — hit your hydration goal 7 days in a row to earn the Bronze Sigil.
            </Text>
          )}

          <Text style={styles.fieldLabel}>HERO NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={DEFAULT_HERO_NAME}
            placeholderTextColor="rgba(255,255,255,0.35)"
            maxLength={24}
            returnKeyType="done"
          />

          <Text style={styles.fieldLabel}>STARTER EMBLEM</Text>
          <View style={styles.emblemGrid}>
            {STARTER_EMBLEMS.map((e) => {
              const selected = e.id === emblemId;
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[styles.emblemChip, selected && styles.emblemChipSelected]}
                  onPress={() => setEmblemId(e.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emblemEmoji}>{e.emoji}</Text>
                  <Text style={[styles.emblemLabel, selected && styles.emblemLabelSelected]}>
                    {e.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.cta}
            onPress={() => {
              const hero = freshHero(name, emblemId);
              // Preserve rank + cape + mask when editing — only the name +
              // emblem are user-editable in this v1 sheet.
              const merged: Hero = initialHero
                ? { ...initialHero, name: hero.name, emblemId: hero.emblemId }
                : hero;
              onConfirm(merged, !editing);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>
              {editing ? "Save Changes" : "Start Origin Story"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.dismiss}>
            <Text style={styles.dismissText}>{editing ? "Cancel" : "Maybe later"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: NAVY,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,215,0,0.35)",
  },
  eyebrow: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  subhead: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  subheadAccent: { color: GOLD, fontWeight: "700" },
  fieldLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.35)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  emblemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emblemChip: {
    width: 90,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    gap: 4,
  },
  emblemChipSelected: {
    borderColor: GOLD,
    backgroundColor: "rgba(255,215,0,0.12)",
  },
  emblemEmoji: { fontSize: 28 },
  emblemLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.3,
  },
  emblemLabelSelected: { color: GOLD },
  cta: {
    marginTop: 20,
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  ctaText: {
    color: NAVY,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  dismiss: { alignSelf: "center", marginTop: 14, paddingVertical: 6 },
  dismissText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600" },
});
