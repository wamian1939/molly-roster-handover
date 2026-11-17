import { describe, expect, it } from "vitest";
import { matchFormalRoles } from "../src/formalRoleMatch.js";

describe("formal role association", () => {
  it("matches all six approved Hurstville codes and excludes a retired QA role", () => {
    const jobs = [
      ["trainer", "带训员"], ["li-xiaobai", "莉小白"], ["front-counter", "前台"],
      ["training", "培训"], ["back-kitchen", "后厨"], ["full-role", "全岗"],
    ].map(([code, name]) => ({ id: code, code, name, isActive: true }));
    const roles = [
      { id: "trainer-role", storeId: null, code: "trainer", nameZh: "带训", isActive: true },
      { id: "xiaobai-role", storeId: "hurstville", code: "li-xiaobai", nameZh: "莉小白", isActive: true },
      { id: "counter-role", storeId: "hurstville", code: "front-counter", nameZh: "前台", isActive: true },
      { id: "training-role", storeId: null, code: "training", nameZh: "培训", isActive: true },
      { id: "kitchen-role", storeId: null, code: "back-kitchen", nameZh: "后厨", isActive: true },
      { id: "all-role", storeId: null, code: "all-rounder", nameZh: "全岗", isActive: true },
      { id: "qa-role", storeId: "hurstville", code: "qa-role", nameZh: "验收岗", isActive: false },
    ];
    const result = matchFormalRoles(jobs, roles, "hurstville");
    expect(result.ids).toEqual(["trainer-role", "xiaobai-role", "counter-role", "training-role", "kitchen-role", "all-role"]);
    expect(result.names["qa-role"]).toBeUndefined();
  });
  it("does not grant a same-name legacy role an unrelated formal code", () => {
    const jobs = [{ id: "formal-front", code: "official-front", name: "前场", isActive: true }];
    const roles = [{ id: "legacy-front", storeId: null, code: "front", nameZh: "前场", isActive: true }];
    expect(matchFormalRoles(jobs, roles, "hurstville")).toEqual({ ids: [], names: {}, colors: {}, jobRoleIds: {} });
  });

  it("preserves the existing all-rounder to full-role alias", () => {
    const jobs = [{ id: "formal-all", code: "full-role", name: "全岗", isActive: true }];
    const roles = [{ id: "legacy-all", storeId: null, code: "all-rounder", nameZh: "全岗", isActive: true }];
    expect(matchFormalRoles(jobs, roles, "hurstville").jobRoleIds).toEqual({ "formal-all": "legacy-all" });
  });
});
