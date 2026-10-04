"use client";

import { useEffect, useRef, type RefObject } from "react";

// A ref that always holds the latest render value, for timers and client tools that must read
// current state without being re-created on every render.
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
