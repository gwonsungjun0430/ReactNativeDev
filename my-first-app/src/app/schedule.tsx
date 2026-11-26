import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  TimeFormat,
  formatNowClock,
  getRangeTexts,
  hourLabel,
  useTimeFormat,
} from "../lib/timeSettings";

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

// 일정 시간마다 현재 시각을 갱신하는 훅
function useNow(intervalMs: number) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
function NowClock({ format }: { format: TimeFormat }) {
  const now = useNow(1000);
  return <Text style={styles.nowClock}>{formatNowClock(now, format)}</Text>;
}

// 시간표 위에서 실시간으로 움직이는 현재 시각 눈금 + 지나간 칸 흐리게
function NowLine() {
  const now = useNow(1000);
  const row = (now.getHours() - 5 + 24) % 24;
  const fraction = (now.getMinutes() * 60 + now.getSeconds()) / 3600;
  const passedCols = Math.floor(now.getMinutes() / 10);
  return (
    <>
      {row > 0 && (
        <View
          style={[styles.pastBlock, { top: 0, height: row * ROW_H, width: "100%" }]}
        />
      )}
      {passedCols > 0 && (
        <View
          style={[
            styles.pastBlock,
            {
              top: row * ROW_H,
              height: ROW_H,
              width: `${(passedCols / 6) * 100}%` as `${number}%`,
            },
          ]}
        />
      )}
      <View style={[styles.nowRow, { top: row * ROW_H }]} />
      <View
        style={[
          styles.nowLine,
          {
            top: row * ROW_H,
            left: `${fraction * 100}%` as `${number}%`,
          },
        ]}
      >
        <View style={styles.nowDot} />
      </View>
    </>
  );
}

export default function ScheduleScreen() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // 오늘 할 일 + 날짜 없는 예전 할 일
  const todayTodos = todos.filter((t) => !t.date || t.date === todayKey);

  const activeId = todayTodos.some((t) => t.id === selectedId)
    ? selectedId
    : todayTodos[0]?.id ?? null;

  const slotOwner: Record<number, Todo> = {};
  todayTodos.forEach((t) =>
    (t.slots ?? []).forEach((s) => {
      slotOwner[s] = t;
    })
  );

  const today = new Date();
  const dateLabel = `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}. (${WEEKDAYS[today.getDay()]})`;

  // 여러 칸을 칠하거나(paint) 지우기(erase)
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

  // 칸 하나 누르기: 내 칸이면 지우고, 아니면 칠하기
  const toggleSlot = (slot: number) => {
    const action = slotOwner[slot]?.id === activeId ? "erase" : "paint";
    applySlots([slot], action);
  };

  // 시간 숫자 누르기: 1시간(6칸) 한 번에 칠하기/지우기
  const toggleHour = (hour: number) => {
    if (!activeId) return;
    const hourSlots = COLS.map((c) => hour * 6 + c);
    const active = todos.find((t) => t.id === activeId);
    const allMine = hourSlots.every((s) => active?.slots?.includes(s));
    applySlots(hourSlots, allMine ? "erase" : "paint");
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.container}>
        <Link href="/" style={styles.backLink}>
          ← 내 할 일
        </Link>

        <View style={styles.scheduleHeader}>
          <View>
            <Text style={styles.scheduleTitle}>오늘 일정</Text>
            <Text style={styles.scheduleDate}>{dateLabel}</Text>
          </View>
                    <NowClock format={timeFormat} />
        </View>

        <Text style={styles.hint}>
          할 일을 선택하고 오른쪽 칸을 눌러 시간을 칠하세요. (한 칸 = 10분) 칠한 칸을
          다시 누르면 지워져요. 왼쪽 시간 숫자를 누르면 1시간이 한 번에 칠해져요.
          시간 표기는 24시(12시) 형식이고, 빨간 눈금이 현재 시각이에요.
        </Text>

        {todayTodos.length === 0 ? (
          <Text style={styles.empty}>
            {loaded
              ? "오늘 할 일이 없어요. '내 할 일'에서 먼저 추가하세요."
              : "불러오는 중..."}
          </Text>
        ) : (
          <View style={styles.scheduleBody}>
            <View style={styles.scheduleLeft}>
              {todayTodos.map((t) => {
                const minutes = (t.slots?.length ?? 0) * 10;
                const ranges = getRangeTexts(t.slots ?? [], timeFormat);
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
                      {ranges.map((r) => (
                        <Text key={r} style={styles.subjectRange}>
                          {r}
                        </Text>
                      ))}
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
                    <Text style={styles.hourText} numberOfLines={1}>
                      {hourLabel(hour, timeFormat)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.gridArea}>
                {HOURS.map((hour) => (
                  <View key={hour} style={styles.gridRow}>
                    {COLS.map((c) => {
                      const slot = hour * 6 + c;
                      const owner = slotOwner[slot];
                      return (
                        <Pressable
                          key={c}
                          style={[
                            styles.gridCell,
                            owner && { backgroundColor: colorOf(owner.id) },
                          ]}
                          onPress={() => toggleSlot(slot)}
                        />
                      );
                    })}
                  </View>
                ))}
                <NowLine />
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#fff" },
  content: { paddingTop: 60, paddingBottom: 60, paddingHorizontal: 16 },
  container: { width: "100%", maxWidth: 560, alignSelf: "center" },
  backLink: { color: "#2563eb", fontSize: 16, marginBottom: 16 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },

  scheduleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  scheduleTitle: { fontSize: 24, fontWeight: "bold", color: "#000" },
  scheduleDate: { fontSize: 13, color: "#666", marginTop: 2 },
  nowClock: { fontSize: 20, fontWeight: "bold", color: "#2563eb" },
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
  subjectRange: { fontSize: 11, color: "#6d28d9", marginTop: 1 },
  scheduleRight: {
    width: 200,
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#ccc",
  },
  hourColumn: { width: 40 },
  hourLabel: {
    height: ROW_H,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f7f7",
    borderWidth: 0.5,
    borderColor: "#ddd",
  },
  hourText: { fontSize: 10, color: "#555" },
  gridArea: { flex: 1 },
  gridRow: { flexDirection: "row" },
  gridCell: {
    flex: 1,
    height: ROW_H,
    borderWidth: 0.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },

  // 지나간 시간 흐리게
  pastBlock: {
    position: "absolute",
    left: 0,
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    pointerEvents: "none",
  },

  // 현재 시각 눈금 (터치는 아래 칸으로 통과)
  nowRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ROW_H,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    pointerEvents: "none",
  },
  nowLine: {
    position: "absolute",
    width: 2,
    height: ROW_H,
    marginLeft: -1,
    backgroundColor: "#ef4444",
    pointerEvents: "none",
  },
  nowDot: {
    position: "absolute",
    top: -3,
    left: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ef4444",
  },
});