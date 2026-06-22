// hooks/useStreamingSteps.ts
import { useEffect, useRef, useState } from "react";

const SQL_STEPS = [
  "Sorunuz analiz ediliyor...",
  "SQL sorgusu oluşturuluyor...",
  "Veritabanından veriler alınıyor...",
  "Yanıt hazırlanıyor...",
];

export function useStreamingSteps(isLoading: boolean) {
  const [stepIndex, setStepIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null); // ✅ Düzeltildi

  useEffect(() => {
    if (!isLoading) {
      setStepIndex(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    setStepIndex(0);
    intervalRef.current = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= SQL_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 1800);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  return SQL_STEPS[stepIndex];
}