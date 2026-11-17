import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { StoreJobService } from "../src/storeJobService.js";

describe("StoreJobService", () => {
  it("lists only jobs inside the caller's authorized Store scope", async () => {
    const findMany = vi.fn(async () => []);
    const service = new StoreJobService({ storeJobDefinition: { findMany } } as never);
    await service.list(["hurstville", "greensquare"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: { in: ["hurstville", "greensquare"] }, isActive: true } }));
  });

  it("creates the same job name independently in different Stores", async () => {
    const create = vi.fn(async ({ data }) => ({ id: `${data.storeId}-job`, ...data, isActive: true }));
    const db = { store: { findFirst: vi.fn(async ({ where }) => ({ id: where.id })) }, storeJobDefinition: { create } };
    const service = new StoreJobService(db as never);
    await expect(service.create("hurstville", { name: "值班负责人", colorToken: "teal", displayOrder: 30 })).resolves.toMatchObject({ storeId: "hurstville" });
    await expect(service.create("greensquare", { name: "值班负责人", colorToken: "teal", displayOrder: 30 })).resolves.toMatchObject({ storeId: "greensquare" });
  });

  it("returns a clear conflict for duplicate names in one Store", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.19.3" });
    const db = { store: { findFirst: vi.fn(async () => ({ id: "store-1" })) }, storeJobDefinition: { create: vi.fn(async () => { throw duplicate; }) } };
    await expect(new StoreJobService(db as never).create("store-1", { name: "全岗", colorToken: "teal", displayOrder: 10 })).rejects.toMatchObject({ status: 409 });
  });
});
