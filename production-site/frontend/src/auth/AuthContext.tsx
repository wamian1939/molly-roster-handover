import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { markAuthSessionChanged } from "../lib/apiClient";
import { authRepository, type AuthUser } from "./authRepository";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const requestRevision = authRevision.current;
    authRepository.me()
      .then(({ user: current }) => { if (active && requestRevision === authRevision.current) setUser(current); })
      .catch(() => { if (active && requestRevision === authRevision.current) setUser(null); })
      .finally(() => { if (active && requestRevision === authRevision.current) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const clear = () => { authRevision.current += 1; markAuthSessionChanged(); setUser(null); setIsLoading(false); };
    window.addEventListener("auth:unauthorized", clear);
    return () => window.removeEventListener("auth:unauthorized", clear);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    authRevision.current += 1;
    setIsLoading(false);
    const result = await authRepository.login(username, password);
    markAuthSessionChanged();
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    authRevision.current += 1;
    markAuthSessionChanged();
    setUser(null);
    setIsLoading(false);
    await authRepository.logout();
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [isLoading, login, logout, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

