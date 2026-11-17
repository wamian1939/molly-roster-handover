import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManualAvailabilityBatchDialog } from "./ManualAvailabilityBatchDialog";

const services = vi.hoisted(() => ({ availability: vi.fn(), replaceAvailability: vi.fn() }));
vi.mock("../../services/rosterRepository", () => ({ rosterRepository: services }));
vi.mock("../ui/ToastProvider", () => ({ InlineSpinner: () => <span /> }));

const props = () => ({ storeId: "store-1", employeeId: "employee-1", employeeName: "HandoverEmployee006", initialDate: "2026-10-21",
  timezone: "Australia/Sydney", weekStartsOn: 1, workforceReady: true, onClose: vi.fn(), onCommitted: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  services.availability.mockResolvedValue([]);
  services.replaceAvailability.mockResolvedValue([]);
});
afterEach(() => cleanup());

describe("manual multi-date Availability dialog", () => {
  it("cancels a selected date without an Availability write", async () => {
    const input = props();
    render(<ManualAvailabilityBatchDialog {...input} />);
    const date = await screen.findByRole("button", { name: "2026-10-26" });
    await waitFor(() => expect((date as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(date);
    expect(screen.getByText(/已选 1 天/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(input.onClose).toHaveBeenCalledOnce();
    expect(services.replaceAvailability).not.toHaveBeenCalled();
  });

  it("does not select recorded dates and saves two dates across a month boundary atomically", async () => {
    const input = props();
    services.availability.mockImplementation(async (_store: string, from: string) => from === "2026-09-28"
      ? [{ date: "2026-10-27" }] : []);
    render(<ManualAvailabilityBatchDialog {...input} />);
    const recorded = await screen.findByRole("button", { name: "2026-10-27" });
    await waitFor(() => expect((recorded as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "2026-10-26" }));
    fireEvent.click(screen.getByRole("button", { name: "下一个月" }));
    const november = await screen.findByRole("button", { name: "2026-11-09" });
    await waitFor(() => expect((november as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(november);
    fireEvent.click(screen.getByRole("button", { name: "保存 2 天可用时间" }));
    await waitFor(() => expect(input.onCommitted).toHaveBeenCalledWith(2));
    expect(services.replaceAvailability).toHaveBeenCalledWith({
      storeId: "store-1", employeeId: "employee-1", dates: ["2026-10-26", "2026-11-09"], expectedRows: [],
      entries: [
        { date: "2026-10-26", status: "AVAILABLE", startAt: "2026-10-25T22:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z", source: "MANUAL" },
        { date: "2026-11-09", status: "AVAILABLE", startAt: "2026-11-08T22:00:00.000Z", endAt: "2026-11-09T11:00:00.000Z", source: "MANUAL" },
      ],
    });
  });

  it("retains the selection and requires a fresh read after a concurrent write", async () => {
    const input = props();
    services.replaceAvailability.mockRejectedValueOnce(new Error("可用时间已被其他人修改"));
    render(<ManualAvailabilityBatchDialog {...input} />);
    const date = await screen.findByRole("button", { name: "2026-10-26" });
    await waitFor(() => expect((date as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(date);
    const save = screen.getByRole("button", { name: "保存 1 天可用时间" });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("其他人修改"));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(input.onCommitted).not.toHaveBeenCalled();
    services.availability.mockResolvedValueOnce([{ date: "2026-10-26" }]);
    fireEvent.click(screen.getByRole("button", { name: "重新核对日期" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("已有记录"));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(services.replaceAvailability).toHaveBeenCalledTimes(1);
  });

  it("rechecks a selected date outside the visible month after a conflict", async () => {
    const input = props();
    services.availability.mockImplementation(async (_store: string, from: string) => from === "2026-10-15"
      ? [{ date: "2026-10-15" }] : []);
    services.replaceAvailability.mockRejectedValueOnce(new Error("可用时间已被其他人修改"));
    render(<ManualAvailabilityBatchDialog {...input} />);
    const october = await screen.findByRole("button", { name: "2026-10-15" });
    await waitFor(() => expect((october as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(october);
    fireEvent.click(screen.getByRole("button", { name: "下一个月" }));
    const november = await screen.findByRole("button", { name: "2026-11-09" });
    await waitFor(() => expect((november as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(november);
    const save = screen.getByRole("button", { name: "保存 2 天可用时间" });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("其他人修改"));
    fireEvent.click(screen.getByRole("button", { name: "下一个月" }));
    const december = await screen.findByRole("button", { name: "2026-12-09" });
    await waitFor(() => expect((december as HTMLButtonElement).disabled).toBe(false));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "重新核对日期" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "上一个月" }));
    fireEvent.click(screen.getByRole("button", { name: "重新核对日期" }));
    await waitFor(() => expect(services.availability).toHaveBeenCalledWith("store-1", "2026-10-15", "2026-10-15", "employee-1"));
    expect(screen.getByRole("alert").textContent).toContain("已有记录");
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "下一个月" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("已有记录"));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(input.onCommitted).not.toHaveBeenCalled();
    expect(services.replaceAvailability).toHaveBeenCalledTimes(1);
  });
});
