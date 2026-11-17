import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const services = vi.hoisted(() => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock("./authRepository", () => ({ authRepository: services }));

function Consumer() {
  const { user, login, logout } = useAuth();
  return <><span>{user?.username ?? "signed-out"}</span><button onClick={() => void login("new-user", "password")}>Log in</button><button onClick={() => void logout()}>Log out</button></>;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("AuthProvider", () => {
  it("does not let an older startup session check clear a completed login", async () => {
    let rejectInitial!: (reason: Error) => void;
    services.me.mockImplementation(() => new Promise((_resolve, reject) => { rejectInitial = reject; }));
    services.login.mockResolvedValue({ user: { username: "new-user" } });
    render(<AuthProvider><Consumer /></AuthProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(screen.getByText("new-user")).toBeTruthy());
    await act(async () => { rejectInitial(new Error("Old session expired")); });
    expect(screen.getByText("new-user")).toBeTruthy();
  });

  it("hides the previous account while the logout request is still pending", async () => {
    let finishLogout!: () => void;
    services.me.mockResolvedValue({ user: { username: "previous-user" } });
    services.logout.mockImplementation(() => new Promise<void>((resolve) => { finishLogout = resolve; }));
    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("previous-user")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByText("signed-out")).toBeTruthy();
    await act(async () => { finishLogout(); });
  });
});
