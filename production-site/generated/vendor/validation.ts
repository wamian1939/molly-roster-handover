import { z } from "zod";
import { HttpError } from "./httpError.js";

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const dateString = z.string().refine(isCalendarDate, "请输入实际存在的 YYYY-MM-DD 日期");
export const isoDateTime = z.string().datetime({ offset: true });
export const storeIdSchema = z.string().trim().min(1, "请选择门店").max(128);
export const versionSchema = z.coerce.number().int().min(1);

export function dateOnly(value: string) {
  if (!isCalendarDate(value)) throw new HttpError(400, "请输入实际存在的 YYYY-MM-DD 日期");
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

