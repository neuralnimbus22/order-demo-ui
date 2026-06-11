"use client";

// Cart state — frontend only, by contract (no backend cart service). Lines
// live in React context and persist to localStorage so a refresh keeps the
// cart. localStorage is touched only after mount (SSR-safe); `hydrated` lets
// consumers hold rendering until the persisted cart has loaded, avoiding both
// hydration mismatches and an "empty cart" flash.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface CartLine {
  sku: string;
  name: string;
  price: number;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  hydrated: boolean;
  count: number; // total items (sum of qty)
  subtotal: number;
  add: (line: Omit<CartLine, "qty">, qty?: number) => void;
  remove: (sku: string) => void;
  setQty: (sku: string, qty: number) => void;
  clear: () => void;
}

const STORAGE_KEY = "sundry-cart-v1";
const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const loaded = useRef(false);

  // One-time hydration from localStorage. This must be an effect (the store
  // is browser-only, so it can't seed useState during SSR), and the setState
  // here runs exactly once on mount — the cascading-render concern the rule
  // guards against doesn't apply.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) setLines(parsed.filter((l) => l.qty > 0));
      }
    } catch {
      // corrupted storage — start with an empty cart
    }
    loaded.current = true;
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded.current) return; // don't overwrite storage before first load
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // storage full/unavailable — cart still works for this session
    }
  }, [lines]);

  const add = useCallback((line: Omit<CartLine, "qty">, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.sku === line.sku);
      if (existing) {
        return prev.map((l) =>
          l.sku === line.sku ? { ...l, qty: l.qty + qty } : l,
        );
      }
      return [...prev, { ...line, qty }];
    });
  }, []);

  const remove = useCallback((sku: string) => {
    setLines((prev) => prev.filter((l) => l.sku !== sku));
  }, []);

  const setQty = useCallback((sku: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.sku !== sku)
        : prev.map((l) => (l.sku === sku ? { ...l, qty } : l)),
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartState>(
    () => ({
      lines,
      hydrated,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((s, l) => s + l.price * l.qty, 0),
      add,
      remove,
      setQty,
      clear,
    }),
    [lines, hydrated, add, remove, setQty, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
