import { describe, expect, it } from "vitest";
import {
  forwardEvaluationNavigation,
  isSafeInternalReturnPath,
  resolveEvaluationBackTarget,
  withEvaluationNavigation,
} from "./evaluationNavigation";

describe("evaluation navigation context", () => {
  it.each([
    ["/evaluations/stores/hurstville/employees/regular", "REGULAR", "返回正式员工"],
    ["/evaluations/stores/hurstville/employees/training", "TRAINING", "返回培训员工"],
  ] as const)("preserves the source employee list %s", (path, employeeType, label) => {
    const navigation = withEvaluationNavigation("/evaluation-rounds/round-1", { pathname: path, search: "" } as never, "employee-list");
    const resolved = resolveEvaluationBackTarget({ search: navigation.to.slice(navigation.to.indexOf("?")), state: navigation.state, storeId: "hurstville", employeeType });
    expect(resolved).toEqual({ path, label });
  });

  it("forwards round-detail context to an individual evaluation", () => {
    const source = withEvaluationNavigation("/evaluations/v1/eval-1", { pathname: "/evaluation-rounds/round-1", search: "" } as never, "round-detail");
    const forwarded = forwardEvaluationNavigation("/evaluations/v1/eval-1", source.to.slice(source.to.indexOf("?")), source.state);
    const resolved = resolveEvaluationBackTarget({ search: forwarded.to.slice(forwarded.to.indexOf("?")), state: forwarded.state, storeId: "hurstville", employeeType: "REGULAR" });
    expect(resolved).toEqual({ path: "/evaluation-rounds/round-1", label: "返回本轮汇总" });
  });

  it("falls back by round or evaluation employee type after a deep link", () => {
    expect(resolveEvaluationBackTarget({ search: "", state: null, storeId: "hurstville", employeeType: "REGULAR" })).toEqual({
      path: "/evaluations/stores/hurstville/employees/regular",
      label: "返回正式员工",
    });
    expect(resolveEvaluationBackTarget({ search: "", state: null, storeId: "hurstville", employeeType: "TRAINING" })).toEqual({
      path: "/evaluations/stores/hurstville/employees/training",
      label: "返回培训员工",
    });
  });

  it.each(["https://evil.example", "//evil.example/path", "/\\evil.example", "javascript:alert(1)"])("rejects unsafe returnTo %s", (path) => {
    expect(isSafeInternalReturnPath(path)).toBe(false);
    const resolved = resolveEvaluationBackTarget({ search: `?returnTo=${encodeURIComponent(path)}`, state: null, storeId: "hurstville", employeeType: "REGULAR" });
    expect(resolved.path).toBe("/evaluations/stores/hurstville/employees/regular");
  });
});
