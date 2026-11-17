import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().trim().min(1).optional(),
);

const v1RatingSchema = z.number().int().min(1).max(5);
const v1SkillStatusSchema = z.enum(["Unknown", "NotTrained", "Training", "Independent", "Proficient", "CannotDo", "CanDo"]);
export const currentSkillConfirmationSchema = z.object({
  status: v1SkillStatusSchema,
  expectedUpdatedAt: z.iso.datetime().nullable(),
  reason: z.string().trim().min(3).max(500),
}).strict();
const accountRoleSchema = z.enum(["ADMIN", "STORE_EVALUATOR"]);
const employeeTypeSchema = z.enum(["TRAINING", "REGULAR"]);
const nullableTrimmedString = (maximum = 255) => z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  z.string().trim().min(1).max(maximum).nullable().optional(),
);
const nullableDateSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.coerce.date().nullable().optional(),
);
const passwordSchema = z.string().min(8, "密码至少需要 8 个字符").max(200);

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
}).strict();

export const accountCreateSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, "用户名只能包含字母、数字、点、下划线或短横线"),
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
  role: accountRoleSchema,
  storeIds: z.array(z.string().trim().min(1)).max(100).optional(),
}).strict();

export const accountUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: accountRoleSchema.optional(),
  storeIds: z.array(z.string().trim().min(1)).max(100).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const accountListQuerySchema = z.object({
  storeId: optionalTrimmedString,
});

export const resetPasswordSchema = z.object({ password: passwordSchema }).strict();

export const storeEvaluationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(["NotEvaluated", "Submitted", "Completed"]).optional(),
  employmentType: z.enum(["Full-time", "Part-time", "Casual"]).optional(),
  employeeType: employeeTypeSchema.optional(),
  search: optionalTrimmedString,
});

export const liveEvaluationSubmissionSchema = z.object({
  speedRating: z.number().int().min(1).max(5),
  initiativeRating: z.number().int().min(1).max(5),
  attitudeRating: z.number().int().min(1).max(5),
  availabilityRating: z.number().int().min(1).max(5),
  textFeedback: z.string().max(8000).default(""),
  skills: z.array(z.object({
    skillDefinitionId: z.string().min(1),
    status: z.enum(["NotTrained", "Training", "Independent", "Proficient", "CannotDo", "CanDo"]),
  }).strict()).min(1),
}).strict();

export const liveSkillPreviewSchema = z.object({
  skills: z.array(z.object({
    skillDefinitionId: z.string().min(1),
    status: v1SkillStatusSchema,
  }).strict()).min(1),
}).strict();

const employeeIdSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().trim().min(1).optional(),
);

const performanceDimensions = [
  "skill",
  "speed",
  "initiative",
  "attitude",
  "availability",
  "text",
] as const;

export const performanceNoteListQuerySchema = z.object({
  employeeId: optionalTrimmedString,
  storeId: optionalTrimmedString,
  noteType: z.enum(["Positive", "Negative", "Neutral", "Coaching"]).optional(),
  dimension: z.enum(performanceDimensions).optional(),
  dateFrom: optionalTrimmedString,
  dateTo: optionalTrimmedString,
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const performanceNoteMutationSchema = z.object({
  employeeId: z.string().trim().min(1),
  storeId: z.string().trim().min(1),
  noteDate: z.coerce.date().optional(),
  noteType: z.enum(["Positive", "Negative", "Neutral", "Coaching"]),
  dimensions: z.array(z.enum(performanceDimensions)).default([]),
  scoreImpact: z.number().int().min(-10).max(10).nullable().optional(),
  noteText: z.string().trim().min(1).max(2000),
});

export const employeeListQuerySchema = z.object({
  storeId: optionalTrimmedString,
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: optionalTrimmedString,
  employmentType: z.enum(["Full-time", "Part-time", "Casual"]).optional(),
  employeeType: employeeTypeSchema.optional(),
  status: z.enum(["Active", "Archived"]).optional(),
  jobId: optionalTrimmedString,
});

export const storeJobMutationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: nullableTrimmedString(80),
  colorToken: z.enum(["rose", "teal", "violet", "amber", "blue", "slate"]).default("slate"),
  displayOrder: z.number().int().min(0).max(9999).default(0),
}).strict();

export const storeJobUpdateSchema = storeJobMutationSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const evaluationHistoryQuerySchema = z.object({
  storeId: optionalTrimmedString,
  employeeType: employeeTypeSchema.optional(),
  employeeId: optionalTrimmedString,
  tier: z.enum(["T1", "T2", "T3", "T4", "T5"]).optional(),
  jobId: optionalTrimmedString,
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const employeeMutationSchema = z.object({
  id: employeeIdSchema,
  storeId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(120),
  surname: nullableTrimmedString(120),
  givenName: nullableTrimmedString(120),
  englishName: nullableTrimmedString(120),
  gender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
  dateOfBirth: nullableDateSchema,
  employmentType: z.enum(["Full-time", "Part-time", "Casual"]),
  employeeType: employeeTypeSchema.default("REGULAR"),
  status: z.enum(["Active", "Archived"]).optional(),
  jobIds: z.array(z.string().trim().min(1)).max(50).default([]),
  emailAddress: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
    z.string().trim().email().max(254).nullable().optional(),
  ),
  mobileTelephoneNumber: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
    z.string().trim().min(8).max(24).regex(/^\+?[0-9 ()-]+$/).nullable().optional(),
  ),
  addressLine: nullableTrimmedString(240),
  suburb: nullableTrimmedString(120),
  state: nullableTrimmedString(32),
  postcode: nullableTrimmedString(12),
  employmentCommencementDate: nullableDateSchema,
  bankAccountName: nullableTrimmedString(160),
  bsbNumber: nullableTrimmedString(16),
  bankAccountNumber: nullableTrimmedString(32),
  taxFileNumber: nullableTrimmedString(32),
  abn: nullableTrimmedString(32),
  holdsWorkingHolidayVisa: z.boolean().nullable().optional(),
  visaType: nullableTrimmedString(120),
  superannuationCompany: nullableTrimmedString(160),
  superannuationAccountNumber: nullableTrimmedString(64),
  uniqueSuperannuationIdentifier: nullableTrimmedString(64),
}).strict();

export const employeeUpdateSchema = employeeMutationSchema.partial().extend({
  id: z.never().optional(),
  employeeType: employeeTypeSchema.optional(),
  jobIds: z.array(z.string().trim().min(1)).max(50).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const analyticsV1QuerySchema = z.object({
  storeId: optionalTrimmedString,
  employeeType: employeeTypeSchema.optional(),
});

export const storeMutationSchema = z.object({
  id: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Store ID must use lowercase letters, numbers, and hyphens."),
  name: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(80),
  managerName: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
});

export const storeUpdateSchema = storeMutationSchema.omit({ id: true }).partial();
