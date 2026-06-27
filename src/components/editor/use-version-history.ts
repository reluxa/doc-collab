"use client";

import { useCallback, useEffect, useState } from "react";

/** Keyboard shortcut Ctrl/Cmd+Shift+H to toggle version history. */
export function useVersionHistory() {
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const toggleVersionHistory = useCallback(() => {
    setShowVersionHistory((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "H") {
        e.preventDefault();
        toggleVersionHistory();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleVersionHistory]);

  return { showVersionHistory, toggleVersionHistory };
}
