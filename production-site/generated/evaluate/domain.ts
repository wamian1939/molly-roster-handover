import type { Employee, PerformanceNote, Store, StoreJobDefinition } from "@prisma/client";

export type PerformanceNoteWithRelations = PerformanceNote & {
  employee: Employee;
  store: Store;
};

export type EmployeeWithStore = Employee & {
  store: Store;
  jobAssignments?: Array<{ job: StoreJobDefinition }>;
  _count?: {
    evaluations?: number;
  };
};

export function toFrontendEmploymentType(type: Employee["employmentType"]) {
  const map = {
    FullTime: "Full-time",
    PartTime: "Part-time",
    Casual: "Casual",
  } as const;
  return map[type];
}

export function toBackendEmploymentType(type: string) {
  const normalized = type.trim().toLowerCase();
  if (normalized === "full-time" || normalized === "fulltime") return "FullTime";
  if (normalized === "part-time" || normalized === "parttime") return "PartTime";
  if (normalized === "casual") return "Casual";
  return "FullTime";
}

export function toFrontendEmployeeStatus(status: Employee["status"]) {
  const map = {
    Active: "Active",
    Archived: "Archived",
  } as const;
  return map[status];
}

export function toBackendEmployeeStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "archived" || normalized === "inactive" || normalized === "deactivated") return "Archived";
  return null;
}

export function toFrontendEmployee(employee: EmployeeWithStore) {
  return {
    id: employee.id,
    storeId: employee.storeId,
    storeName: employee.store.name,
    displayName: employee.displayName,
    employmentType: toFrontendEmploymentType(employee.employmentType),
    employmentCommencementDate: dateOnly(employee.employmentCommencementDate),
    tenureMonths: calculateTenureMonths(employee.employmentCommencementDate),
    status: toFrontendEmployeeStatus(employee.status),
    employeeType: employee.employeeType ?? "REGULAR",
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    archivedAt: employee.archivedAt?.toISOString(),
    evaluationCount: employee._count?.evaluations ?? 0,
    jobs: (employee.jobAssignments ?? []).map(({ job }) => ({
      id: job.id,
      storeId: job.storeId,
      name: job.name,
      code: job.code,
      colorToken: job.colorToken,
      displayOrder: job.displayOrder,
      isActive: job.isActive,
    })),
  };
}
export type EmployeeListItemDTO = ReturnType<typeof toFrontendEmployee>;
export type EmployeeOperationalDetailDTO = EmployeeListItemDTO;

export function toFrontendEmployeeProfile(employee: EmployeeWithStore) {
  return {
    ...toFrontendEmployee(employee),
    surname: employee.surname,
    givenName: employee.givenName,
    englishName: employee.englishName,
    legalName: [employee.givenName, employee.surname].filter(Boolean).join(" ") || null,
    gender: employee.gender,
    dateOfBirth: dateOnly(employee.dateOfBirth),
    emailAddress: employee.emailAddress,
    mobileTelephoneNumber: employee.mobileTelephoneNumber,
    addressLine: employee.addressLine,
    suburb: employee.suburb,
    state: employee.state,
    postcode: employee.postcode,
    bankAccountName: employee.bankAccountName,
    bsbNumber: employee.bsbNumber,
    bankAccountNumber: employee.bankAccountNumber,
    taxFileNumber: employee.taxFileNumber,
    abn: employee.abn,
    holdsWorkingHolidayVisa: employee.holdsWorkingHolidayVisa,
    visaType: employee.visaType,
    superannuationCompany: employee.superannuationCompany,
    superannuationAccountNumber: employee.superannuationAccountNumber,
    uniqueSuperannuationIdentifier: employee.uniqueSuperannuationIdentifier,
  };
}
export type EmployeeAdminProfileDTO = ReturnType<typeof toFrontendEmployeeProfile>;

export function calculateTenureMonths(startDate: Date | null, now = new Date()) {
  if (!startDate || startDate > now) return null;
  let months = (now.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + now.getUTCMonth() - startDate.getUTCMonth();
  if (now.getUTCDate() < startDate.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toFrontendPerformanceNote(note: PerformanceNoteWithRelations) {
  return {
    id: note.id,
    employeeId: note.employeeId,
    employeeName: note.employee.displayName,
    employeeStatus: toFrontendEmployeeStatus(note.employee.status),
    storeId: note.storeId,
    storeName: note.store.name,
    authorId: note.authorId ?? "",
    noteDate: note.noteDate.toISOString(),
    noteType: note.noteType,
    dimensions: note.dimensions,
    scoreImpact: note.scoreImpact,
    noteText: note.noteText,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
