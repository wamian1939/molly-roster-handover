import type { ShiftRole } from "../types/roster";

export class RoleMutationResponseError extends Error {
  constructor() {
    super("服务器返回的岗位与本次操作不符或内容不完整。请重新读取岗位列表，核对是否已保存，避免重复提交。");
    this.name = "RoleMutationResponseError";
  }
}

type ExpectedRole = {
  storeId: string;
  code: string;
  nameZh: string;
  isActive: boolean;
  requiredSkillCodes: string[];
  id?: string;
  previousVersion?: number;
};

export function assertRoleMutationResponse(value: unknown, expected: ExpectedRole): ShiftRole {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RoleMutationResponseError();
  const row = value as Record<string, unknown>;
  const savedSkills = row.requiredSkillCodes;
  if (typeof row.id !== "string" || !row.id || (expected.id && row.id !== expected.id)
    || row.storeId !== expected.storeId || row.code !== expected.code || row.nameZh !== expected.nameZh
    || row.isActive !== expected.isActive || typeof row.colorToken !== "string"
    || !/^#[0-9a-fA-F]{6}$/.test(row.colorToken)
    || !Array.isArray(savedSkills)
    || savedSkills.length !== expected.requiredSkillCodes.length
    || !expected.requiredSkillCodes.every((skill) => savedSkills.includes(skill))
    || !Number.isInteger(row.displayOrder) || Number(row.displayOrder) < 0
    || !Number.isInteger(row.version) || Number(row.version) <= (expected.previousVersion ?? 0)) {
    throw new RoleMutationResponseError();
  }
  return row as ShiftRole;
}
