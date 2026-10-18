import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors } from "@/theme/tokens";

const SIZE = 240;
const ARC_WIDTH = 20;
const TRACK_WIDTH = 4;

export function ringGeometry(size: number, stroke: number, seconds: number, total: number) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, seconds / total)) : 0;
  return { radius, circumference, offset: circumference * (1 - fraction) };
}

/**
 * Handoff CountdownRing, SOS tone, 240 size: a thin yellow track and a thick
 * yellow arc that shrinks each second, the number at 120. Decorative for
 * screen readers; the check-in overlay announces the count instead.
 */
export function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const { radius, circumference, offset } = ringGeometry(SIZE, ARC_WIDTH, seconds, total);
  const centre = SIZE / 2;
  return (
    <View
      style={styles.ring}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle cx={centre} cy={centre} r={radius} fill="none" stroke={colors.sosBg} strokeWidth={TRACK_WIDTH} />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={colors.sosBg}
          strokeWidth={ARC_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      </Svg>
      <View style={styles.numberWrap}>
        <Text style={styles.number} maxFontSizeMultiplier={1}>
          {seconds}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: SIZE, height: SIZE },
  numberWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  number: {
    color: colors.sosBg,
    fontSize: 120,
    lineHeight: 132,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: -3,
  },
});
