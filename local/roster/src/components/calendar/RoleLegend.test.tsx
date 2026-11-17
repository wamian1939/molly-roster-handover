import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoleLegend } from "./RoleLegend";

afterEach(cleanup);

describe("RoleLegend", () => {
  it("renders exactly the active scoped roles supplied by the database response", () => {
    render(<RoleLegend roles={[
      { id: "global", storeId: null, code: "front", nameZh: "前场", colorToken: "#2563eb", requiredSkillCodes: [] },
      { id: "store", storeId: "store-1", code: "bar", nameZh: "水吧", colorToken: "#0f766e", requiredSkillCodes: [] },
    ]} />);

    expect(screen.getByLabelText("当前门店启用岗位，共 2 个")).toBeTruthy();
    expect(screen.getByText("前场")).toBeTruthy();
    expect(screen.getByText("水吧")).toBeTruthy();
  });

  it("does not render an empty legend", () => {
    const { container } = render(<RoleLegend roles={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
