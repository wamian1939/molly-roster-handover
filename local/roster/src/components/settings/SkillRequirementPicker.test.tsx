import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillRequirementPicker } from "./SkillRequirementPicker";

const skills = [
  { code: "order-taking", nameZh: "点单", category: "Front", skillMode: "PROGRESSIVE" as const },
  { code: "cup-labeling", nameZh: "贴杯", category: "Bar", skillMode: "PROGRESSIVE" as const },
];

describe("SkillRequirementPicker", () => {
  it("exposes canonical codes as labelled checkboxes and updates selection", async () => {
    const onChange = vi.fn();
    render(<SkillRequirementPicker skills={skills} selected={["order-taking"]} onChange={onChange} loading={false} error={null} onRetry={vi.fn()} />);
    expect((screen.getByRole("checkbox", { name: /点单.*order-taking/ }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole("checkbox", { name: /贴杯.*cup-labeling/ }));
    expect(onChange).toHaveBeenCalledWith(["order-taking", "cup-labeling"]);
  });

  it("keeps catalog failures visible and offers a retry", async () => {
    const onRetry = vi.fn();
    render(<SkillRequirementPicker skills={[]} selected={[]} onChange={vi.fn()} loading={false} error="无法读取目录" onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("无法读取目录");
    await userEvent.click(screen.getByRole("button", { name: "重新读取技能" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
