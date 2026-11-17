// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SkillStatusControl } from "./SkillStatusControl";

describe("SkillStatusControl layout", () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  it("keeps all three binary choices on one compact row", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => root.render(
      <SkillStatusControl label="Opening" value="Unknown" disabled={false} skillMode="BINARY" onChange={vi.fn()} />,
    ));

    const group = host.querySelector('[role="radiogroup"]');
    expect(group?.className).toContain("grid-cols-3");
    expect(group?.querySelectorAll('[role="radio"]')).toHaveLength(3);

    await act(async () => root.unmount());
  });

  it("retains the responsive four-choice layout for progressive skills", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => root.render(
      <SkillStatusControl label="Tea" value="NotTrained" disabled={false} onChange={vi.fn()} />,
    ));

    const group = host.querySelector('[role="radiogroup"]');
    expect(group?.className).toContain("grid-cols-2");
    expect(group?.className).toContain("sm:grid-cols-4");
    expect(group?.querySelectorAll('[role="radio"]')).toHaveLength(4);

    await act(async () => root.unmount());
  });
});
