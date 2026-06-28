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

  // Re-seed when the modal opens with a different hero (edit-mode case).
  React.useEffect(() => {
    if (visible) {
      setName(initialHero?.name ?? "");
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

          <TouchableOpacity
            style={styles.cta}
            onPress={() => {
              // emblemId defaults to STARTER_EMBLEMS[0] silently — the picker
              // was cut after Build 33 testing because emblems are purely
              // decorative and the Family Mode avatar palette already covers
              // visual identity. Keeping the field in the Hero schema means
              // no migration risk; rendering paths still resolve a glyph.
              const hero = freshHero(name, STARTER_EMBLEMS[0].id);
              // Preserve rank + cape + mask + emblem when editing — only the
              // name is user-editable in this sheet.
              const merged: Hero = initialHero
                ? { ...initialHero, name: hero.name }
                : hero;
              onConfirm(merged, !editing);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>
              {editing ? "Save Changes" : "Start Your Hydro Journey"}
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
