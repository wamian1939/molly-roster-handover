// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { EmployeeType, ScoringPolicySnapshotV1 } from "../../types/evaluation";
import { ScorePreviewCard } from "./ScorePreviewCard";

const currentPolicies: Array<{ employeeType: EmployeeType; policy: ScoringPolicySnapshotV1; maxima: number[] }> = [
  {
    employeeType: "REGULAR",
    policy: { policyId: "REGULAR_V3", tierPolicyVersion: 2, skillWeight: 60, speedWeight: 15, initiativeWeight: 5, attitudeWeight: 5, availabilityWeight: 10, textWeight: 5 },
    maxima: [60, 15, 5, 5, 10, 5],
  },
  {
    employeeType: "TRAINING",
    policy: { policyId: "TRAINING_V2", tierPolicyVersion: 2, skillWeight: 40, speedWeight: 10, initiativeWeight: 15, attitudeWeight: 15, availabilityWeight: 5, textWeight: 15 },
    maxima: [40, 10, 15, 15, 5, 15],
  },
];

describe("ScorePreviewCard current policy metadata", () => {
  for (const { employeeType, policy, maxima } of currentPolicies) {
    it(`shows the ${policy.policyId} component maxima supplied by Evaluate`, async () => {
      (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      const host = document.createElement("div");
      const root = createRoot(host);
      await act(async () => root.render(
        <ScorePreviewCard
          scores={null}
          ratingsComplete={false}
          skillsConfirmed={false}
          isLoading={false}
          error={null}
          capableSkills={0}
          activeSkills={1}
          coveragePercentage={0}
          completed={false}
          policy={policy}
          employeeType={employeeType}
        />,
      ));
      expect([...host.querySelectorAll("dl dd")].map((cell) => cell.textContent?.trim())).toEqual(maxima.map((maximum) => `- / ${maximum}`));
      await act(async () => root.unmount());
    });
  }
});
