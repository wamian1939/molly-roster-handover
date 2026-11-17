export type AuthRole = "ADMIN" | "STORE_EVALUATOR";

export type AuthUser = {
  id: string;
  accountId: string;
  userId: string;
  username: string;
  displayName: string;
  role: AuthRole;
  storeIds: string[];
  stores: Array<{ id: string; name: string }>;
  canAccessAllStores: boolean;
};

