"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface ToastItem {
  id: string;
  variant: "success" | "error" | "info" | "warning";
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (variant: ToastItem["variant"], message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((variant: ToastItem["variant"], message: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, variant, message }]);
    if (variant === "success") {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`flex items-center gap-2 rounded-md px-4 py-3 shadow-[0_4px_12px_rgba(15,23,42,.10)] transition-all duration-180 animate-[slideIn_180ms_ease] ${
              toast.variant === "success"
                ? "bg-surface text-success border border-success/20"
                : toast.variant === "error"
                  ? "bg-surface text-danger border border-danger/20"
                  : toast.variant === "warning"
                    ? "bg-surface text-warning border border-warning/20"
                    : "bg-surface text-info border border-info/20"
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 text-text-subtle hover:text-text"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
