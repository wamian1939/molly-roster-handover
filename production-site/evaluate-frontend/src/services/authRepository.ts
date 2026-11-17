export type AccountRole = "ADMIN" | "STORE_EVALUATOR";

export type AuthUser = {
  id: string;
  accountId: string;
  userId: string;
  username: string;
  displayName: string;
  role: AccountRole;
  stores: Array<{ id: string; name: string }>;
  storeIds: string[];
  canAccessAllStores: boolean;
};

export type ManagedAccount = {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  stores: Array<{ id: string; name: string; isActive: boolean }>;
  canAccessAllStores: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const authRepository = {
  async login(username: string, password: string) {
    return apiRequest<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  async me() {
    return apiRequest<{ user: AuthUser }>("/auth/me");
  },
  async logout() {
    return apiRequest<{ ok: true }>("/auth/logout", { method: "POST" });
  },
  async listAccounts(storeId?: string) {
    return apiRequest<ManagedAccount[]>(`/admin/accounts${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`);
  },
  async createAccount(payload: {
    username: string;
    displayName: string;
    password: string;
    role: AccountRole;
    storeIds: string[];
  }) {
    return apiRequest<ManagedAccount>("/admin/accounts", { method: "POST", body: JSON.stringify(payload) });
  },
  async updateAccount(accountId: string, payload: Partial<Pick<ManagedAccount, "displayName" | "role" | "isActive">> & { storeIds?: string[] }) {
    return apiRequest<ManagedAccount>(`/admin/accounts/${encodeURIComponent(accountId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async resetPassword(accountId: string, password: string) {
    return apiRequest<{ ok: true }>(`/admin/accounts/${encodeURIComponent(accountId)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },
  async deleteAccount(accountId: string) {
    return apiRequest<{ ok: true }>(`/admin/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  },
};
import { apiRequest } from "./apiClient";
