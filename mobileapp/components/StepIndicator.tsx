// components/StepIndicator.tsx
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, View, Text, StyleSheet } from "react-native";

export function StepIndicator({ label }: { label: string }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Her adım değişince fade-in
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [label]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#4A90E2" />
      <Animated.Text style={[styles.text, { opacity }]}>
        {label}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F0F4FF",
    borderRadius: 12,
    alignSelf: "flex-start",
    marginVertical: 4,
  },
  text: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
  },
});