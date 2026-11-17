import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import type { ShiftRole } from "../../types/roster";
import { StaffRoleFilter } from "./StaffRoleFilter";

const roles: ShiftRole[] = [
  { id: "front", storeId: null, code: "front", nameZh: "前场", colorToken: "#2563eb", requiredSkillCodes: ["order-taking"] },
  { id: "bar", storeId: null, code: "bar", nameZh: "水吧", colorToken: "#0f766e", requiredSkillCodes: ["drink-making"] },
];

afterEach(cleanup);

describe("StaffRoleFilter", () => {
  it("supports single, multiple, and clear states", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole("group", { name: "按班次技能需求筛选" })).toBeTruthy();
    expect(screen.getByText(/正式岗位资格需单独核对/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部员工" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("checkbox", { name: "前场" }));
    await user.click(screen.getByRole("checkbox", { name: "水吧" }));
    expect((screen.getByRole("checkbox", { name: "前场" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "水吧" }) as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole("button", { name: "全部员工" }));
    expect((screen.getByRole("checkbox", { name: "前场" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "水吧" }) as HTMLInputElement).checked).toBe(false);
  });

  it("toggles a role from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const checkbox = screen.getByRole("checkbox", { name: "前场" }) as HTMLInputElement;

    checkbox.focus();
    await user.keyboard("[Space]");
    expect(checkbox.checked).toBe(true);
  });
});

function Harness() {
  const [values, setValues] = useState<string[]>([]);
  return <StaffRoleFilter roles={roles} values={values} onChange={setValues} />;
}
