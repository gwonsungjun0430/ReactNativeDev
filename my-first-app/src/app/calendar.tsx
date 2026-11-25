import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import { Link, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Todo = {
  id: string;
  title: string;
  done: boolean;
  date?: string; // "2026-11-25" 형식
};

const STORAGE_KEY = "todos";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");
// month는 0부터 시작 (0 = 1월)
const toKey = (y: number, m: number, d: number) =>
  `${y}-${pad(m + 1)}-${pad(d)}`;

export default function CalendarScreen() {
  const today = new Date();
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(todayKey);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);

  // 이 화면이 열릴 때마다 저장된 목록 불러오기
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const saved = await AsyncStorage.getItem(STORAGE_KEY);
          if (active && saved) setTodos(JSON.parse(saved));
        } catch (e) {
          console.log("불러오기 실패", e);
        } finally {
          if (active) setLoaded(true);
        }
      };
      load();
      return () => {
        active = false;
      };
    }, [])
  );

  // 목록이 바뀌면 자동 저장
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos)).catch((e) =>
      console.log("저장 실패", e)
    );
  }, [todos, loaded]);

  const moveMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  // 날짜별로 할 일 묶기
  const byDate: Record<string, Todo[]> = {};
  todos.forEach((t) => {
    if (!t.date) return;
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t);
  });

  // 달력 칸 만들기
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthPrefix = `${year}-${pad(month + 1)}`;
  const monthTodos = todos.filter((t) => t.date?.startsWith(monthPrefix));
  const monthDone = monthTodos.filter((t) => t.done).length;

  const selectedTodos = byDate[selected] ?? [];
  const selectedLabel = `${Number(selected.slice(5, 7))}월 ${Number(
    selected.slice(8, 10)
  )}일`;

  const addTodo = () => {
    const title = text.trim();
    if (!title) return;
    setTodos((prev) => [
      { id: Date.now().toString(), title, done: false, date: selected },
      ...prev,
    ]);
    setText("");
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" >
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← 목록으로
        </Link>

        {/* 월 이동 */}
        <View style={styles.monthRow}>
          <Pressable onPress={() => moveMonth(-1)} style={styles.navButton}>
            <Text style={styles.navText}>◀</Text>
          </Pressable>
          <Text style={styles.monthTitle}>
            {year}년 {month + 1}월
          </Text>
          <Pressable onPress={() => moveMonth(1)} style={styles.navButton}>
            <Text style={styles.navText}>▶</Text>
          </Pressable>
        </View>
        <Text style={styles.monthSummary}>
          이번 달 할 일 {monthTodos.length}개 (완료 {monthDone}개)
        </Text>

        {/* 요일 */}
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[
                styles.weekday,
                i === 0 && styles.sunday,
                i === 6 && styles.saturday,
              ]}
            >
              {w}
            </Text>
          ))}
        </View>

        {/* 날짜 칸 */}
        <View style={styles.grid}>
          {cells.map((day, index) => {
            if (day === null) {
              return <View key={`empty-${index}`} style={styles.cell} />;
            }
            const key = toKey(year, month, day);
            const items = byDate[key] ?? [];
            const hasUndone = items.some((t) => !t.done);
            const isSelected = key === selected;
            const isToday = key === todayKey;
            return (
              <Pressable
                key={key}
                style={styles.cell}
                onPress={() => setSelected(key)}
              >
                <View
                  style={[
                    styles.cellInner,
                    isToday && styles.cellToday,
                    isSelected && styles.cellSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      index % 7 === 0 && styles.sunday,
                      index % 7 === 6 && styles.saturday,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                  {items.length > 0 && (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: hasUndone ? "#2563eb" : "#9ca3af" },
                      ]}
                    >
                      <Text style={styles.badgeText}>{items.length}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* 선택한 날짜의 할 일 */}

        {selectedTodos.length === 0 ? (
          <Text style={styles.empty}>이 날은 할 일이 없어요.</Text>
        ) : (
          selectedTodos.map((item) => (
            <View key={item.id} style={styles.item}>
              <Pressable
                style={styles.itemMain}
                onPress={() => toggleTodo(item.id)}
              >
                <View
                  style={[styles.checkbox, item.done && styles.checkboxDone]}
                >
                  {item.done && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text
                  style={[styles.itemText, item.done && styles.itemTextDone]}
                >
                  {item.title}
                </Text>
              </Pressable>
              <Pressable onPress={() => deleteTodo(item.id)}>
                <Text style={styles.deleteText}>삭제</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
        <View style={styles.bottomBar}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={`${selectedLabel} 할 일 추가`}
        placeholderTextColor="#888"
        onSubmitEditing={addTodo}
        returnKeyType="done"
      />
      <Pressable style={styles.addButton} onPress={addTodo}>
        <Text style={styles.addButtonText}>추가</Text>
      </Pressable>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
      screen: { flex: 1, backgroundColor: "#fff" },
  bottomBar: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    paddingBottom: 56,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  scroll: { flex: 1, backgroundColor: "#fff" },
  content: { paddingTop: 60, paddingBottom: 40, paddingHorizontal: 16 },
  container: { width: "100%", maxWidth: 560, alignSelf: "center" },
  backLink: { color: "#2563eb", fontSize: 16, marginBottom: 12 },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navButton: { padding: 12 },
  navText: { fontSize: 18, color: "#2563eb" },
  monthTitle: { fontSize: 24, fontWeight: "bold", color: "#000" },
  monthSummary: {
    textAlign: "center",
    color: "#666",
    marginBottom: 16,
  },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: {
    width: "14.2857%",
    textAlign: "center",
    fontWeight: "600",
    color: "#444",
    paddingVertical: 6,
  },
  sunday: { color: "#dc2626" },
  saturday: { color: "#2563eb" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.2857%", aspectRatio: 1, padding: 2 },
  cellInner: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  cellToday: { borderColor: "#2563eb" },
  cellSelected: { backgroundColor: "#2563eb" },
  dayText: { fontSize: 16, color: "#000" },
  dayTextSelected: { color: "#fff", fontWeight: "bold" },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#000",
    marginTop: 24,
    marginBottom: 12,
  },
  inputRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#000",
  },
  addButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  empty: { color: "#888", textAlign: "center", marginTop: 16 },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxDone: { backgroundColor: "#2563eb" },
  checkMark: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  itemText: { flex: 1, fontSize: 16, color: "#000" },
  itemTextDone: { textDecorationLine: "line-through", color: "#999" },
  deleteText: { color: "#dc2626", fontWeight: "600" },
});