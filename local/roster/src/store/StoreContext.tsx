import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";

type StoreSelection = {
  selectedStoreId: string;
  setSelectedStoreId: (storeId: string) => void;
  initializeStoreId: (availableStoreIds: readonly string[], preferredStoreId?: string) => void;
};

const StoreContext = createContext<StoreSelection | null>(null);

function rememberedStore(accountId: string) {
  try { return window.sessionStorage.getItem(`molly-roster:store:${accountId}`) ?? ""; }
  catch { return ""; }
}

function rememberStore(accountId: string, storeId: string) {
  try { window.sessionStorage.setItem(`molly-roster:store:${accountId}`, storeId); }
  catch { /* A disabled storage API must not prevent in-page store selection. */ }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [storeSelection, setStoreSelection] = useState<{ accountId: string; storeId: string } | null>(null);
  const [discoveredStores, setDiscoveredStores] = useState<{ accountId: string; ids: readonly string[] } | null>(null);
  const storeIds = user?.storeIds ?? [];
  // Every account waits for store discovery before starting store-scoped reads.
  // A remembered store is restored only when it is still in the current list.
  const candidate = user && storeSelection?.accountId === user.accountId ? storeSelection.storeId : "";
  const selectedStoreId = (user?.role === "ADMIN" || storeIds.includes(candidate))
    && discoveredStores?.accountId === user?.accountId
    && discoveredStores?.ids.includes(candidate) ? candidate : "";

  const setSelectedStoreId = useCallback((storeId: string) => {
    if (user && discoveredStores?.accountId === user.accountId
      && discoveredStores.ids.includes(storeId)
      && (user.role === "ADMIN" || user.storeIds.includes(storeId))) {
      setStoreSelection({ accountId: user.accountId, storeId });
      rememberStore(user.accountId, storeId);
    }
  }, [discoveredStores, user]);

  const initializeStoreId = useCallback((availableStoreIds: readonly string[], preferredStoreId?: string) => {
    if (!user) return;
    const allowed = availableStoreIds.filter((storeId) => user.role === "ADMIN" || user.storeIds.includes(storeId));
    setDiscoveredStores({ accountId: user.accountId, ids: allowed });
    const saved = rememberedStore(user.accountId);
    const restored = preferredStoreId && allowed.includes(preferredStoreId) ? preferredStoreId
      : saved && allowed.includes(saved) ? saved : allowed[0] ?? "";
    setStoreSelection((current) => current?.accountId === user.accountId
      && allowed.includes(current.storeId) && !preferredStoreId ? current
      : { accountId: user.accountId, storeId: restored });
  }, [user]);

  useEffect(() => {
    if (user && storeSelection?.accountId === user.accountId) rememberStore(user.accountId, storeSelection.storeId);
  }, [storeSelection, user]);

  const value = useMemo(() => ({ selectedStoreId, setSelectedStoreId, initializeStoreId }), [initializeStoreId, selectedStoreId, setSelectedStoreId]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStoreSelection() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStoreSelection must be used inside StoreProvider");
  return context;
}
