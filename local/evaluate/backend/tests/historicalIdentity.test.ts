import { describe, expect, it } from "vitest";
import { resolveHistoricalIdentity } from "../src/historicalIdentity.js";

const current = { employee: { displayName: "Current Employee" }, store: { name: "Current Store" } };

describe("legacy CLOSED identity evidence", () => {
  it("prefers close-time snapshots over all later or earlier names", () => {
    expect(resolveHistoricalIdentity({ ...current, employeeDisplayNameSnapshot: "Close Employee", storeNameSnapshot: "Close Store", evaluations: [{ employeeNameSnapshot: "Evaluation Employee", storeNameSnapshot: "Evaluation Store" }] })).toEqual({
      employeeName: "Close Employee", storeName: "Close Store", identitySources: { employeeName: "ROUND_CLOSE_SNAPSHOT", storeName: "ROUND_CLOSE_SNAPSHOT" },
    });
  });

  it("uses a unanimous personal-evaluation label without calling it a close snapshot", () => {
    expect(resolveHistoricalIdentity({ ...current, employeeDisplayNameSnapshot: null, storeNameSnapshot: null, evaluations: [
      { employeeNameSnapshot: "Recorded Employee", storeNameSnapshot: "Recorded Store" },
      { employeeNameSnapshot: "Recorded Employee", storeNameSnapshot: "Recorded Store" },
    ] })).toEqual({
      employeeName: "Recorded Employee", storeName: "Recorded Store", identitySources: { employeeName: "EVALUATION_SNAPSHOT", storeName: "EVALUATION_SNAPSHOT" },
    });
  });

  it("marks current-name fallback when historical labels conflict or are absent", () => {
    expect(resolveHistoricalIdentity({ ...current, employeeDisplayNameSnapshot: null, storeNameSnapshot: null, evaluations: [
      { employeeNameSnapshot: "Old A", storeNameSnapshot: null },
      { employeeNameSnapshot: "Old B", storeNameSnapshot: null },
    ] })).toEqual({
      employeeName: "Current Employee", storeName: "Current Store", identitySources: { employeeName: "CURRENT_PROFILE_FALLBACK", storeName: "CURRENT_PROFILE_FALLBACK" },
    });
  });
});
