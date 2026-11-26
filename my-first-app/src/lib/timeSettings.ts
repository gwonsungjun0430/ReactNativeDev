import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type TimeFormat = "24h" | "12h";

const SETTINGS_KEY = "settings";
const SLOTS_PER_DAY = 144;

const pad = (n: number) => String(n).padStart(2, "0");



export async function loadTimeFormat(): Promise<TimeFormat> {
  try {
    const saved = await AsyncStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.timeFormat === "12h" || parsed.timeFormat === "24h") {
        return parsed.timeFormat;
      }
    }
  } catch (e) {
    console.log("설정 불러오기 실패", e);
  }
  return "24h";
}

export async function saveTimeFormat(timeFormat: TimeFormat) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ timeFormat }));
  } catch (e) {
    console.log("설정 저장 실패", e);
  }
}

// 화면이 열릴 때마다 저장된 시간 표시 방식을 불러오는 훅
export function useTimeFormat(): TimeFormat {
  const [format, setFormat] = useState<TimeFormat>("24h");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadTimeFormat().then((f) => {
        if (active) setFormat(f);
      });
      return () => {
        active = false;
      };
    }, [])
  );
  return format;
}

// 칸 번호 -> "09:00" 또는 "오전 9:00"
export const formatSlotClock = (slot: number, format: TimeFormat) => {
  const minutes = (slot % SLOTS_PER_DAY) * 10;
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  if (format === "12h") {
    return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(m)}`;
  }
  return `${pad(h)}:${pad(m)}`;
};

// 현재 시간 -> "15:45:12" 또는 "오후 3:45:12"
export const formatNowClock = (date: Date, format: TimeFormat) => {
  const h = date.getHours();
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  if (format === "12h") {
    return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${m}:${s}`;
  }
  return `${pad(h)}:${m}:${s}`;
};

// 시간표 왼쪽 시간 표시
export const hourLabel = (hour: number, format: TimeFormat) => {
  if (format === "12h") {
    return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}`;
  }
  // 24시간제: 13시~0시만 괄호로 12시간제를 같이 표시
  return hour >= 13 || hour === 0 ? `${hour}(${hour % 12 || 12})` : `${hour}`;
};

const DAY_START_SLOT = 5 * 6; // 시간표는 5시부터 시작

// 5시를 기준으로 한 하루의 순서 (이어진 칸을 찾기 위해 사용)
const dayOrder = (slot: number) =>
  (slot - DAY_START_SLOT + SLOTS_PER_DAY) % SLOTS_PER_DAY;

// 이어진 칸들을 "09:00 ~ 11:00" 구간으로 묶기
export const getRangeTexts = (slots: number[], format: TimeFormat) => {
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