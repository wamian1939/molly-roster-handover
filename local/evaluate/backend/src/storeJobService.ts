import { Prisma, type PrismaClient } from "@prisma/client";
import { createHttpError } from "./httpError.js";

export type StoreJobPayload = {
  name?: string;
  code?: string | null;
  colorToken?: "rose" | "teal" | "violet" | "amber" | "blue" | "slate";
  displayOrder?: number;
  isActive?: boolean;
};

export class StoreJobService {
  constructor(private readonly db: PrismaClient) {}

  async list(storeIds: string[] | undefined, storeId?: string, includeInactive = false) {
    return this.db.storeJobDefinition.findMany({
      where: {
        ...(storeId ? { storeId } : storeIds ? { storeId: { in: storeIds } } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: { id: true, storeId: true, name: true, code: true, colorToken: true, displayOrder: true, isActive: true },
      orderBy: [{ store: { name: "asc" } }, { displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });
  }

  async create(storeId: string, payload: Required<Pick<StoreJobPayload, "name" | "colorToken" | "displayOrder">> & StoreJobPayload) {
    await this.assertActiveStore(storeId);
    try {
      return await this.db.storeJobDefinition.create({
        data: { storeId, name: payload.name, code: payload.code ?? null, colorToken: payload.colorToken, displayOrder: payload.displayOrder },
        select: { id: true, storeId: true, name: true, code: true, colorToken: true, displayOrder: true, isActive: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw createHttpError(409, "该门店已存在同名岗位。");
      }
      throw error;
    }
  }

  async update(jobId: string, payload: StoreJobPayload) {
    const existing = await this.db.storeJobDefinition.findUnique({ where: { id: jobId } });
    if (!existing) throw createHttpError(404, "岗位不存在。");
    if (payload.isActive === true) await this.assertActiveStore(existing.storeId);
    try {
      return await this.db.storeJobDefinition.update({
        where: { id: jobId },
        data: payload,
        select: { id: true, storeId: true, name: true, code: true, colorToken: true, displayOrder: true, isActive: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw createHttpError(409, "该门店已存在同名岗位。");
      }
      throw error;
    }
  }

  async getStoreId(jobId: string) {
    const job = await this.db.storeJobDefinition.findUnique({ where: { id: jobId }, select: { storeId: true } });
    if (!job) throw createHttpError(404, "岗位不存在。");
    return job.storeId;
  }

  private async assertActiveStore(storeId: string) {
    const store = await this.db.store.findFirst({ where: { id: storeId, isActive: true }, select: { id: true } });
    if (!store) throw createHttpError(409, "门店已归档，不能管理岗位。");
  }
}
