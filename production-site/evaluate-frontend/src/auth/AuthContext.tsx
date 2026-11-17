import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authRepository, type AuthUser } from "../services/authRepository";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  selectedStoreId: string | null;
  selectStore: (storeId: string) => void;
  refreshUser: () => Promise<AuthUser | null>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const LAST_STORE_KEY = "evaluate-molly:last-selected-store";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const applyUser = useCallback((nextUser: AuthUser | null) => {
    setUser(nextUser);
    if (!nextUser || nextUser.canAccessAllStores) {
      setSelectedStoreId(null);
      return;
    }
    const stored = window.localStorage.getItem(LAST_STORE_KEY);
    const nextStoreId = nextUser.storeIds.includes(stored ?? "") ? stored : (nextUser.storeIds[0] ?? null);
    setSelectedStoreId(nextStoreId);
    if (nextStoreId) window.localStorage.setItem(LAST_STORE_KEY, nextStoreId);
    else window.localStorage.removeItem(LAST_STORE_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const result = await authRepository.me();
      applyUser(result.user);
      return result.user;
    } catch {
      applyUser(null);
      return null;
    }
  }, [applyUser]);

  useEffect(() => {
    let active = true;
    authRepository.me()
      .then(({ user: currentUser }) => { if (active) applyUser(currentUser); })
      .catch(() => { if (active) applyUser(null); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [applyUser]);

  useEffect(() => {
    const unauthenticated = () => applyUser(null);
    const forbidden = () => { void refreshUser(); };
    window.addEventListener("auth:unauthorized", unauthenticated);
    window.addEventListener("auth:forbidden", forbidden);
    return () => {
      window.removeEventListener("auth:unauthorized", unauthenticated);
      window.removeEventListener("auth:forbidden", forbidden);
    };
  }, [applyUser, refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authRepository.login(username, password);
    applyUser(result.user);
  }, [applyUser]);

  const logout = useCallback(async () => {
    try { await authRepository.logout(); } finally { applyUser(null); }
  }, [applyUser]);

  const selectStore = useCallback((storeId: string) => {
    if (!user || user.canAccessAllStores || !user.storeIds.includes(storeId)) return;
    setSelectedStoreId(storeId);
    window.localStorage.setItem(LAST_STORE_KEY, storeId);
  }, [user]);

  const value = useMemo(() => ({ user, isLoading, selectedStoreId, selectStore, refreshUser, login, logout }), [isLoading, login, logout, refreshUser, selectStore, selectedStoreId, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context hooks intentionally share this module with the provider so consumers have one auth boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
