import { describe, expect, it } from "vitest";
import type { ShiftRole } from "../types/roster";
import type { RosterStoreJob } from "../types/workforce";
import { verifiedShiftRoles } from "./verifiedShiftRoles";

describe("verifiedShiftRoles", () => {
  it("uses Evaluate's current color even when the Roster role has a different saved color", () => {
    const roles = [{ id: "role-1", storeId: "store-1", code: "cashier", nameZh: "Cashier",
      colorToken: "#2563eb", requiredSkillCodes: [] }] as ShiftRole[];
    const jobs = [{ id: "job-1", storeId: "store-1", code: "cashier", name: "Cashier",
      colorToken: "rose", displayOrder: 1, isActive: true }] as RosterStoreJob[];
    expect(verifiedShiftRoles(roles, jobs, "store-1")[0].colorToken).toBe("#9f1239");
  });
  it("shows the six approved Hurstville jobs in Evaluate order without the historical QA role", () => {
    const roles = [
      { id: "trainer", storeId: null, code: "trainer", nameZh: "带训" },
      { id: "xiaobai", storeId: "hurstville", code: "li-xiaobai", nameZh: "莉小白" },
      { id: "counter", storeId: "hurstville", code: "front-counter", nameZh: "前台" },
      { id: "training", storeId: null, code: "training", nameZh: "培训" },
      { id: "kitchen", storeId: null, code: "back-kitchen", nameZh: "后厨" },
      { id: "all", storeId: null, code: "all-rounder", nameZh: "全岗" },
      { id: "qa", storeId: "hurstville", code: "qa-role", nameZh: "验收岗", isActive: false },
    ] as ShiftRole[];
    const jobs = [
      { id: "j1", storeId: "hurstville", code: "trainer", name: "带训员", isActive: true, displayOrder: 10 },
      { id: "j2", storeId: "hurstville", code: "li-xiaobai", name: "莉小白", isActive: true, displayOrder: 20 },
      { id: "j3", storeId: "hurstville", code: "front-counter", name: "前台", isActive: true, displayOrder: 30 },
      { id: "j4", storeId: "hurstville", code: "training", name: "培训", isActive: true, displayOrder: 40 },
      { id: "j5", storeId: "hurstville", code: "back-kitchen", name: "后厨", isActive: true, displayOrder: 50 },
      { id: "j6", storeId: "hurstville", code: "full-role", name: "全岗", isActive: true, displayOrder: 60 },
    ] as RosterStoreJob[];
    expect(verifiedShiftRoles(roles, jobs, "hurstville").map((role) => [role.id, role.nameZh])).toEqual([
      ["trainer", "带训员"], ["xiaobai", "莉小白"], ["counter", "前台"],
      ["training", "培训"], ["kitchen", "后厨"], ["all", "全岗"],
    ]);
  });
  it("reserves a matching formal code without promoting a same-name legacy role", () => {
    const roles = [
      { id: "legacy", storeId: null, code: "legacy", nameZh: "Front" },
      { id: "official", storeId: "hurstville", code: "official-front", nameZh: "Front" },
    ] as ShiftRole[];
    const jobs = [
      { id: "name-only", storeId: "hurstville", code: "other-code", name: "Front", isActive: true, displayOrder: 1 },
      { id: "code-match", storeId: "hurstville", code: "official-front", name: "Front", isActive: true, displayOrder: 2 },
    ] as RosterStoreJob[];
    expect(verifiedShiftRoles(roles, jobs, "hurstville").map((role) => [role.id, role.formalJobId])).toEqual([["official", "code-match"]]);
  });

  it("keeps the existing explicit all-rounder to full-role association", () => {
    const roles = [{ id: "all-rounder", storeId: null, code: "all-rounder", nameZh: "全岗" }] as ShiftRole[];
    const jobs = [{ id: "full-role", storeId: "hurstville", code: "full-role", name: "全岗", isActive: true, displayOrder: 1 }] as RosterStoreJob[];
    expect(verifiedShiftRoles(roles, jobs, "hurstville").map((role) => role.id)).toEqual(["all-rounder"]);
  });

  it("shows only active Evaluate jobs and keeps their names", () => {
    const roles = [
      { id: "r1", storeId: null, code: "all-rounder", nameZh: "全岗" },
      { id: "r2", storeId: null, code: "front", nameZh: "前场" },
      { id: "r3", storeId: null, code: "trainer", nameZh: "带训" },
      { id: "r4", storeId: "hurstville", code: "qa-role", nameZh: "验收岗" },
    ] as ShiftRole[];
    const jobs = [
      { id: "j1", storeId: "hurstville", code: "full-role", name: "全岗", isActive: true, displayOrder: 10 },
      { id: "j2", storeId: "hurstville", code: "trainer", name: "带训员", isActive: true, displayOrder: 20 },
    ] as RosterStoreJob[];
    expect(verifiedShiftRoles(roles, jobs, "hurstville").map((role) => [role.id, role.nameZh])).toEqual([["r1", "全岗"], ["r3", "带训员"]]);
  });
});
