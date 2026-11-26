import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TimeFormat, formatSlotClock, useTimeFormat } from "../lib/timeSettings";
type Todo = {
  id: string;
  title: string;
  done: boolean;
  date?: string;
  slots?: number[]; // 10분 단위 칸 번호 (0~143, 시계 기준 시각)
};

const STORAGE_KEY = "todos";
const COLORS = ["#6d28d9", "#2563eb", "#059669", "#d97706", "#db2777", "#0891b2"];
const SLOTS_PER_DAY = 144;
const DAY_START_SLOT = 5 * 6; // 시간표는 5시부터 시작

const pad = (n: number) => String(n).padStart(2, "0");

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const colorOf = (id: string) =>
  COLORS[(parseInt(id.slice(-3), 10) || 0) % COLORS.length];

// 2시간 30분 형식
const formatKorean = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
};

// // 칸 번호 -> "09:00" 형식 (24시간제)
// const formatClock = (slot: number) => {
//   const minutes = (slot % SLOTS_PER_DAY) * 10;
//   const h = Math.floor(minutes / 60) % 24;
//   const m = minutes % 60;
//   return `${pad(h)}:${pad(m)}`;
// };

// 5시를 기준으로 한 하루의 순서 (이어진 칸을 찾기 위해 사용)
const dayOrder = (slot: number) =>
  (slot - DAY_START_SLOT + SLOTS_PER_DAY) % SLOTS_PER_DAY;

// 이어진 칸들을 "09:00 ~ 11:00" 구간으로 묶기
const getRangeTexts = (slots: number[], format: TimeFormat) => {
  if (slots.length === 0) return [];
  const sorted = [...slots].sort((a, b) => dayOrder(a) - dayOrder(b));
  const ranges: { start: number; end: number }[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (dayOrder(cur) === dayOrder(prev) + 1) {
      prev = cur;
      continue;
    }
    ranges.push({ start, end: prev + 1 });
    start = cur;
    prev = cur;
  }
  ranges.push({ start, end: prev + 1 });
    return ranges.map(
    (r) => `${formatSlotClock(r.start, format)} ~ ${formatSlotClock(r.end, format)}`
  );
};

export default function Index() {
  const [text, setText] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loaded, setLoaded] = useState(false);

  const todayKey = getTodayKey();
  const timeFormat = useTimeFormat();

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

  // 목록이 바뀔 때마다 자동 저장
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos)).catch((e) =>
      console.log("저장 실패", e)
    );
  }, [todos, loaded]);

  const addTodo = () => {
    const title = text.trim();
    if (!title) return;
    setTodos((prev) => [
      { id: Date.now().toString(), title, done: false, date: todayKey },
      ...prev,
    ]);
    setText("");
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, done: !todo.done } : todo
      )
    );
  };

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

  // 오늘 할 일 + 날짜 없는 예전 할 일만 표시
  const todayTodos = todos.filter((t) => !t.date || t.date === todayKey);
  const doneCount = todayTodos.filter((t) => t.done).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>오늘 할 일</Text>
        <View style={styles.linkRow}>
          <Link href="/schedule" style={styles.headerLink}>
            🕒 일정
          </Link>
          <Link href="/calendar" style={styles.headerLink}>
            📅 달력
          </Link>
          <Link href={"/settings" as any} style={styles.headerLink}>
            ⚙️ 설정
          </Link>
        </View>
      </View>
      <Text style={styles.count}>
        완료 {doneCount} / 전체 {todayTodos.length}
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="할 일을 입력하세요"
          placeholderTextColor="#888"
          onSubmitEditing={addTodo}
          returnKeyType="done"
        />
        <Pressable style={styles.addButton} onPress={addTodo}>
          <Text style={styles.addButtonText}>추가</Text>
        </Pressable>
      </View>

      <FlatList
        data={todayTodos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        extraData={timeFormat}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loaded ? "오늘 할 일이 없어요. 하나 추가해보세요!" : "불러오는 중..."}
          </Text>
        }
        renderItem={({ item }) => {
          const minutes = (item.slots?.length ?? 0) * 10;
          const ranges = getRangeTexts(item.slots ?? [], timeFormat);
          return (
            <View style={styles.item}>
              <Pressable
                style={styles.itemMain}
                onPress={() => toggleTodo(item.id)}
              >
                <View
                  style={[styles.checkbox, item.done && styles.checkboxDone]}
                >
                  {item.done && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <View style={styles.itemTextBox}>
                  <Text
                    style={[styles.itemText, item.done && styles.itemTextDone]}
                  >
                    {item.title}
                  </Text>
                  {minutes > 0 ? (
                    <>
                      <Text
                        style={[styles.timeText, { color: colorOf(item.id) }]}
                      >
                        {formatKorean(minutes)}
                      </Text>
                      {ranges.map((r) => (
                        <Text key={r} style={styles.rangeText}>
                          {r}
                        </Text>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.noTimeText}>시간 미설정</Text>
                  )}
                </View>
              </Pressable>
              <Pressable onPress={() => deleteTodo(item.id)}>
                <Text style={styles.deleteText}>삭제</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 70,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 28, fontWeight: "bold", color: "#000" },
  linkRow: { flexDirection: "row", gap: 12 },
  headerLink: { color: "#2563eb", fontSize: 15, fontWeight: "600" },
  count: { color: "#666", marginTop: 4, marginBottom: 20 },
  inputRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
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
  listContent: { paddingBottom: 60 },
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
  itemTextBox: { flex: 1 },
  itemText: { fontSize: 16, color: "#000" },
  itemTextDone: { textDecorationLine: "line-through", color: "#999" },
  timeText: { fontSize: 13, fontWeight: "600", marginTop: 3 },
  rangeText: { fontSize: 12, color: "#666", marginTop: 1 },
  noTimeText: { fontSize: 12, color: "#aaa", marginTop: 3 },
  deleteText: { color: "#dc2626", fontWeight: "600" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
});