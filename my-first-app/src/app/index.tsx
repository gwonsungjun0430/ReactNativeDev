import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
} from "react-native";
import { Link, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Todo = {
  id: string;
  title: string;
  done: boolean;
  date?: string;
  slots?: number[]; // 10분 단위 칸 번호 (0~143, 시계 기준 시각)
};

const STORAGE_KEY = "todos";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const COLORS = ["#6d28d9", "#2563eb", "#059669", "#d97706", "#db2777", "#0891b2"];
const HOURS = Array.from({ length: 24 }, (_, r) => (5 + r) % 24); // 5시 ~ 다음날 4시
const COLS = [0, 1, 2, 3, 4, 5]; // 한 줄 = 1시간 = 10분 x 6칸
const ROW_H = 22;
const SLOTS_PER_DAY = 144;
const DAY_START_SLOT = 5 * 6; // 시간표는 5시부터 시작

// 웹에서 드래그할 때 글자 선택/화면 스크롤 방지
const webOnly: any =
  Platform.OS === "web"
    ? { userSelect: "none", touchAction: "none" }
    : undefined;

const pad = (n: number) => String(n).padStart(2, "0");

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const colorOf = (id: string) =>
  COLORS[(parseInt(id.slice(-3), 10) || 0) % COLORS.length];

// 1:30 형식
const formatDuration = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;

// 2시간 30분 형식
const formatKorean = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
};

// 칸 번호 -> "오전 9:00" 형식
const formatClock = (slot: number) => {
  const minutes = (slot % SLOTS_PER_DAY) * 10;
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`;
};

// 5시를 기준으로 한 하루의 순서 (이어진 칸을 찾기 위해 사용)
const dayOrder = (slot: number) =>
  (slot - DAY_START_SLOT + SLOTS_PER_DAY) % SLOTS_PER_DAY;

// 이어진 칸들을 "오전 9:00 ~ 오전 11:00" 구간으로 묶기
const getRangeTexts = (slots: number[]) => {
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
  return ranges.map((r) => `${formatClock(r.start)} ~ ${formatClock(r.end)}`);
};

export default function Index() {
  const [text, setText] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const gridWidthRef = useRef(0);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    action: "paint" as "paint" | "erase",
  });
  const latest = useRef<{
    start: (x: number, y: number) => void;
    move: (dx: number, dy: number) => void;
  }>({ start: () => {}, move: () => {} });

  const todayKey = getTodayKey();

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

  // ---------- 오늘 일정(시간표) ----------
  const activeId = todayTodos.some((t) => t.id === selectedId)
    ? selectedId
    : todayTodos[0]?.id ?? null;

  const slotOwner: Record<number, Todo> = {};
  todayTodos.forEach((t) =>
    (t.slots ?? []).forEach((s) => {
      slotOwner[s] = t;
    })
  );

  const totalMinutes =
    todayTodos.reduce((sum, t) => sum + (t.slots?.length ?? 0), 0) * 10;

  const now = new Date();
  const dateLabel = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}. (${WEEKDAYS[now.getDay()]})`;

  // 여러 칸을 한 번에 칠하거나(paint) 지우기(erase)
  const applySlots = (slots: number[], action: "paint" | "erase") => {
    if (!activeId || slots.length === 0) return;
    setTodos((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        const mine = t.slots ?? [];
        if (t.id === activeId) {
          if (action === "paint") {
            if (slots.every((s) => mine.includes(s))) return t;
            changed = true;
            return {
              ...t,
              slots: [...mine, ...slots.filter((s) => !mine.includes(s))],
              date: t.date ?? todayKey,
            };
          }
          if (!slots.some((s) => mine.includes(s))) return t;
          changed = true;
          return { ...t, slots: mine.filter((s) => !slots.includes(s)) };
        }
        // 다른 할 일이 칠해둔 칸이면 가져오기
        if (
          action === "paint" &&
          (!t.date || t.date === todayKey) &&
          slots.some((s) => mine.includes(s))
        ) {
          changed = true;
          return { ...t, slots: mine.filter((s) => !slots.includes(s)) };
        }
        return t;
      });
      return changed ? next : prev;
    });
  };

  // 시간 숫자 누르기: 1시간(6칸) 한 번에 칠하기/지우기
  const toggleHour = (hour: number) => {
    if (!activeId) return;
    const hourSlots = COLS.map((c) => hour * 6 + c);
    const active = todos.find((t) => t.id === activeId);
    const allMine = hourSlots.every((s) => active?.slots?.includes(s));
    applySlots(hourSlots, allMine ? "erase" : "paint");
  };

  // 손가락 위치 -> 칸 번호
  const slotAt = (x: number, y: number) => {
    const width = gridWidthRef.current || 1;
    const col = Math.min(5, Math.max(0, Math.floor(x / (width / 6))));
    const row = Math.min(23, Math.max(0, Math.floor(y / ROW_H)));
    return HOURS[row] * 6 + col;
  };

  // 이전 위치에서 지금 위치까지 지나간 칸들 (빠르게 움직여도 빠짐없이)
  const slotsAlong = (x0: number, y0: number, x1: number, y1: number) => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / 4));
    const set = new Set<number>();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      set.add(slotAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
    }
    return Array.from(set);
  };

  // 매 렌더마다 최신 값으로 갱신 (드래그 중에도 최신 상태 사용)
  latest.current = {
    start: (x, y) => {
      const slot = slotAt(x, y);
      // 내가 칠한 칸에서 시작하면 지우기, 아니면 칠하기
      const action = slotOwner[slot]?.id === activeId ? "erase" : "paint";
      dragRef.current = { startX: x, startY: y, lastX: x, lastY: y, action };
      applySlots([slot], action);
    },
    move: (dx, dy) => {
      const d = dragRef.current;
      const x = d.startX + dx;
      const y = d.startY + dy;
      const slots = slotsAlong(d.lastX, d.lastY, x, y);
      d.lastX = x;
      d.lastY = y;
      applySlots(slots, d.action);
    },
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          latest.current.start(
            evt.nativeEvent.locationX,
            evt.nativeEvent.locationY
          );
        },
        onPanResponderMove: (_evt, gesture) => {
          latest.current.move(gesture.dx, gesture.dy);
        },
      }),
    []
  );

  const renderSchedule = () => (
    <View style={styles.schedule}>
      <View style={styles.scheduleHeader}>
        <View>
          <Text style={styles.scheduleTitle}>오늘 일정</Text>
          <Text style={styles.scheduleDate}>{dateLabel}</Text>
        </View>
        <Text style={styles.scheduleTotal}>
          {Math.floor(totalMinutes / 60)}H {totalMinutes % 60}M
        </Text>
      </View>

      <Text style={styles.hint}>
        할 일을 선택하고 오른쪽 칸을 손가락으로 끌어서 칠하세요. (한 칸 = 10분)
        이미 칠한 칸에서 시작하면 지우기가 돼요. 왼쪽 시간 숫자를 누르면 1시간이 한
        번에 칠해져요. 화면을 스크롤하려면 왼쪽 목록 쪽을 밀어주세요.
      </Text>

      {todayTodos.length === 0 ? (
        <Text style={styles.empty}>위에서 오늘 할 일을 먼저 추가하세요.</Text>
      ) : (
        <View style={styles.scheduleBody}>
          <View style={styles.scheduleLeft}>
            {todayTodos.map((t) => {
              const minutes = (t.slots?.length ?? 0) * 10;
              const isActive = t.id === activeId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setSelectedId(t.id)}
                  style={[styles.subject, isActive && styles.subjectActive]}
                >
                  <View
                    style={[styles.colorBar, { backgroundColor: colorOf(t.id) }]}
                  />
                  <View style={styles.subjectText}>
                    <Text style={styles.subjectTitle} numberOfLines={2}>
                      {t.title}
                    </Text>
                    <Text style={styles.subjectTime}>
                      {formatDuration(minutes)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.scheduleRight}>
            <View style={styles.hourColumn}>
              {HOURS.map((hour) => (
                <Pressable
                  key={hour}
                  style={styles.hourLabel}
                  onPress={() => toggleHour(hour)}
                >
                  <Text style={styles.hourText}>{hour % 12 || 12}</Text>
                </Pressable>
              ))}
            </View>

            <View
              style={[styles.gridArea, webOnly]}
              onLayout={(e) => {
                gridWidthRef.current = e.nativeEvent.layout.width;
              }}
              {...panResponder.panHandlers}
            >
              <View style={styles.gridInner}>
                {HOURS.map((hour) => (
                  <View key={hour} style={styles.gridRow}>
                    {COLS.map((c) => {
                      const slot = hour * 6 + c;
                      const owner = slotOwner[slot];
                      return (
                        <View
                          key={c}
                          style={[
                            styles.gridCell,
                            owner && { backgroundColor: colorOf(owner.id) },
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>내 할 일</Text>
        <Link href="/calendar" style={styles.calendarLink}>
          📅 달력
        </Link>
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
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loaded ? "오늘 할 일이 없어요. 하나 추가해보세요!" : "불러오는 중..."}
          </Text>
        }
        ListFooterComponent={renderSchedule()}
        renderItem={({ item }) => {
          const minutes = (item.slots?.length ?? 0) * 10;
          const ranges = getRangeTexts(item.slots ?? []);
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
  calendarLink: { color: "#2563eb", fontSize: 16, fontWeight: "600" },
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

  // 오늘 일정
  schedule: { marginTop: 32 },
  scheduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  scheduleTitle: { fontSize: 22, fontWeight: "bold", color: "#000" },
  scheduleDate: { fontSize: 13, color: "#666", marginTop: 2 },
  scheduleTotal: { fontSize: 22, fontWeight: "bold", color: "#6d28d9" },
  hint: { fontSize: 12, color: "#888", marginTop: 8, marginBottom: 12 },
  scheduleBody: { flexDirection: "row", gap: 12 },
  scheduleLeft: { flex: 1 },
  subject: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    borderRadius: 8,
  },
  subjectActive: { backgroundColor: "#f3f0ff" },
  colorBar: { width: 5, height: 28, borderRadius: 3, marginRight: 8 },
  subjectText: { flex: 1 },
  subjectTitle: { fontSize: 15, fontWeight: "600", color: "#000" },
  subjectTime: { fontSize: 13, color: "#666", marginTop: 2 },
  scheduleRight: {
    width: 190,
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#ccc",
  },
  hourColumn: { width: 26 },
  hourLabel: {
    height: ROW_H,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f7f7",
    borderWidth: 0.5,
    borderColor: "#ddd",
  },
  hourText: { fontSize: 11, color: "#555" },
  gridArea: { flex: 1 },
  gridInner: { pointerEvents: "none" },
  gridRow: { flexDirection: "row" },
  gridCell: {
    flex: 1,
    height: ROW_H,
    borderWidth: 0.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
});