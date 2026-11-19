"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../cn";

type Tone = "success" | "danger";
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Transient result feedback (PRD §5.1). Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === "danger" ? 8000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("danger", m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-(--cf-z-toast) flex w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2"
      >
        {items.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : XCircle;
          return (
            <div
              key={t.id}
              role={t.tone === "danger" ? "alert" : "status"}
              className="pointer-events-auto flex items-center gap-3 rounded-lg bg-fg px-4 py-3 text-sm text-fg-inverse shadow-lg"
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  t.tone === "success" ? "text-green-400" : "text-red-400",
                )}
              />
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
