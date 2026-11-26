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

type Todo = {
  id: string;
  title: string;
  done: boolean;
  date?: string;
};

const STORAGE_KEY = "todos";

const getTodayKey = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function Index() {
  const [text, setText] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const todayKey = getTodayKey();

  
  // 이 화면이 열릴 때마다 저장된 목록 불러오기 (달력에서 바꾼 내용 반영)
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

  // 목록이 바뀔 때마다 자동 저장 (불러오기 전에는 저장하지 않음)
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
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loaded ? "할 일이 없어요. 하나 추가해보세요!" : "불러오는 중..."}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Pressable
              style={styles.itemMain}
              onPress={() => toggleTodo(item.id)}
            >
              <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                {item.done && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <View style={styles.itemTextBox}>
                <Text
                  style={[styles.itemText, item.done && styles.itemTextDone]}
                >
                  {item.title}
                </Text>
                
              </View>
            </Pressable>
            <Pressable onPress={() => deleteTodo(item.id)}>
              <Text style={styles.deleteText}>삭제</Text>
            </Pressable>
          </View>
        )}
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
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#000",
  },
  calendarLink: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
  count: {
    color: "#666",
    marginTop: 4,
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
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
  addButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
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
  checkboxDone: {
    backgroundColor: "#2563eb",
  },
  checkMark: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  itemTextBox: {
    flex: 1,
  },
  itemText: {
    fontSize: 16,
    color: "#000",
  },
  itemTextDone: {
    textDecorationLine: "line-through",
    color: "#999",
  },
  dateText: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  deleteText: {
    color: "#dc2626",
    fontWeight: "600",
  },
  empty: {
    textAlign: "center",
    color: "#888",
    marginTop: 40,
  },
});