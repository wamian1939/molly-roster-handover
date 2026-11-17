import { describe, expect, it } from "vitest";
import { buildPresetScriptInput } from "./presetScriptInput";

describe("buildPresetScriptInput", () => {
  it("scopes a one-employee entry to its canonical Evaluate ID", () => {
    expect(buildPresetScriptInput("store-a", "NEXT", " 1AA 2BB ", { Other: "other" },
      { id: "employee-123", displayName: "Same Name" })).toEqual({
      storeId: "store-a", week: "NEXT", script: "Same Name\t1AA 2BB",
      employeeMappings: [{ nickname: "Same Name", employeeId: "employee-123" }],
    });
  });

  it("uses the selected employee name even when the store has an employee named SelectedEmployee", () => {
    expect(buildPresetScriptInput("store-a", "NEXT", "1234567AA", {},
      { id: "employee-123", displayName: "HandoverEmployee006" })).toEqual({
      storeId: "store-a", week: "NEXT", script: "HandoverEmployee006\t1234567AA",
      employeeMappings: [{ nickname: "HandoverEmployee006", employeeId: "employee-123" }],
    });
  });

  it("preserves the two-column bulk script and explicit nickname choices", () => {
    expect(buildPresetScriptInput("store-a", "CURRENT", "Ali\t1AA\nBob\t2BB", { Ali: "employee-a", Bob: "" }, null)).toEqual({
      storeId: "store-a", week: "CURRENT", script: "Ali\t1AA\nBob\t2BB",
      employeeMappings: [{ nickname: "Ali", employeeId: "employee-a" }],
    });
  });
});
