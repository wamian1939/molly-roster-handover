import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetShortcutSettings } from "./PresetShortcutSettings";

const services = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../../services/rosterRepository", () => ({ rosterRepository: {
  presetShortcuts: services.load,
  savePresetShortcuts: services.save,
} }));

beforeEach(() => {
  vi.clearAllMocks();
  services.load.mockResolvedValue({ configuration: { version: 4, shortcuts: [{ code: "AA", startTime: "09:00", endTime: "17:00" }] } });
  services.save.mockResolvedValue({ version: 5, shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] });
});
afterEach(() => cleanup());

describe("store shortcut settings", () => {
  it("saves edited times with the current store and version", async () => {
    render(<PresetShortcutSettings storeId="store-1" />);
    await waitFor(() => expect(services.load).toHaveBeenCalledWith("store-1"));
    await screen.findByText("当前版本 4", { exact: false });
    fireEvent.change(screen.getByLabelText("开始时间 1"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByLabelText("我已核对本门店快捷码与时间"));
    fireEvent.click(screen.getByRole("button", { name: "保存本门店快捷码" }));
    await waitFor(() => expect(services.save).toHaveBeenCalledWith({ storeId: "store-1", version: 4,
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] }));
    await screen.findByText("当前版本 5", { exact: false });
  });

  it("requires loading an existing configuration before editing", async () => {
    services.load.mockRejectedValueOnce(new Error("offline"));
    render(<PresetShortcutSettings storeId="store-1" />);
    expect((await screen.findByRole("alert")).textContent).toContain("offline");
    expect((screen.getByLabelText("快捷码 1").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "重新加载快捷码" }));
    await waitFor(() => expect(services.load).toHaveBeenCalledTimes(2));
    await screen.findByText("当前版本 4", { exact: false });
  });
});
