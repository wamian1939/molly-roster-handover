import type { Store } from "../types/evaluation";
import { apiRequest } from "./apiClient";

type StoreCounts = {
  employees: number;
  evaluations: number;
  userAccounts: number;
  activeEvaluatorAccounts: number;
};

export type StoreWithCounts = Store & {
  counts: StoreCounts;
};

export type StoreMutationPayload = Store;
export type StoreUpdatePayload = Partial<Omit<Store, "id">>;

export const storeRepository = {
  async fetchStoresForManagement(includeArchived = false) {
    return apiRequest<StoreWithCounts[]>(`/stores/manage${includeArchived ? "?includeArchived=1" : ""}`);
  },
  async createStore(payload: StoreMutationPayload) {
    return apiRequest<Store>("/stores", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async updateStore(storeId: string, payload: StoreUpdatePayload) {
    return apiRequest<Store>(`/stores/${encodeURIComponent(storeId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  async archiveStore(storeId: string) {
    return apiRequest<Store>(`/stores/${encodeURIComponent(storeId)}/archive`, {
      method: "POST",
    });
  },
  async reactivateStore(storeId: string) {
    return apiRequest<Store>(`/stores/${encodeURIComponent(storeId)}/reactivate`, {
      method: "POST",
    });
  },
};
