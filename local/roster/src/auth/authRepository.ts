import { apiRequest } from "../lib/apiClient";

export type AccountRole = "ADMIN" | "STORE_EVALUATOR";

export type AuthUser = {
  id: string;
  accountId: string;
  userId: string;
  username: string;
  displayName: string;
  role: AccountRole;
  storeIds: string[];
  stores: Array<{ id: string; name: string }>;
  canAccessAllStores: boolean;
};

export const authRepository = {
  login(username: string, password: string) {
    return apiRequest<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me() {
    return apiRequest<{ user: AuthUser }>("/auth/me");
  },
  logout() {
    return apiRequest<{ ok: true }>("/auth/logout", { method: "POST" });
  },
};

