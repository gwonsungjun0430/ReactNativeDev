import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Link } from "expo-router";
import {
  TimeFormat,
  loadTimeFormat,
  saveTimeFormat,
  formatNowClock,
} from "../lib/timeSettings";

const OPTIONS: { value: TimeFormat; title: string; example: string }[] = [
  { value: "24h", title: "24시간제", example: "예: 15:45 / 시간표 15(3)" },
  { value: "12h", title: "오전/오후", example: "예: 오후 3:45 / 시간표 오후 3" },
];

export default function SettingsScreen() {
  const [format, setFormat] = useState<TimeFormat>("24h");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    loadTimeFormat().then(setFormat);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const choose = (value: TimeFormat) => {
    setFormat(value);
    saveTimeFormat(value);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← 오늘 할 일
        </Link>
        <Text style={styles.title}>설정</Text>

        <Text style={styles.sectionTitle}>시간 표시 방식</Text>
        {OPTIONS.map((opt) => {
          const selected = format === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => choose(opt.value)}
            >
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{opt.title}</Text>
                <Text style={styles.optionExample}>{opt.example}</Text>
              </View>
            </Pressable>
          );
        })}

        <View style={styles.preview}>
          <Text style={styles.previewLabel}>미리보기 (현재 시간)</Text>
          <Text style={styles.previewTime}>{formatNowClock(now, format)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", paddingTop: 60, paddingHorizontal: 20 },
  container: { width: "100%", maxWidth: 560, alignSelf: "center" },
  backLink: { color: "#2563eb", fontSize: 16, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "bold", color: "#000", marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#444", marginBottom: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  optionSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#999",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioSelected: { borderColor: "#2563eb" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: "600", color: "#000" },
  optionExample: { fontSize: 13, color: "#666", marginTop: 2 },
  preview: {
    marginTop: 20,
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#f7f7f7",
    alignItems: "center",
  },
  previewLabel: { fontSize: 13, color: "#666" },
  previewTime: { fontSize: 26, fontWeight: "bold", color: "#2563eb", marginTop: 6 },
});