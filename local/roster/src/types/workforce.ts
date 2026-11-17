export type RosterStore = { id: string; name: string; isActive: boolean };
export type RosterStoreJob = { id: string; storeId: string; name: string; code: string | null; colorToken: string; displayOrder: number; isActive: boolean };
export type SkillStatus = "NotTrained" | "Training" | "Independent" | "Proficient" | "Unknown" | "CannotDo" | "CanDo";
export type RosterEmployee = {
  id: string;
  displayName: string;
  employeeType: "REGULAR" | "TRAINING";
  employmentType: string | null;
  storeId: string;
  storeName: string;
  isActive: boolean;
  officialScore: { score: number; tier: "T1" | "T2" | "T3" | "T4" | "T5"; roundId: string; closedAt: string } | null;
  positions?: Array<{ id: string; code: string | null; name: string }>;
  skillSummary: {
    overallPercent: number | null;
    backOfHousePercent: number | null;
    waterBarPercent: number | null;
    frontOfHousePercent: number | null;
    qualifiedSkillCodes: string[];
    skills: Array<{ code: string; nameZh: string; category: string; mode: "PROGRESSIVE" | "BINARY"; status: SkillStatus; updatedAt: string }>;
    operations: { opening: "UNKNOWN" | "CAN_DO" | "CANNOT_DO"; closing: "UNKNOWN" | "CAN_DO" | "CANNOT_DO"; weeklyCleaning: "UNKNOWN" | "CAN_DO" | "CANNOT_DO" };
  };
};

export type WorkforceEnvelope<T> = T & { contractVersion: string; generatedAt: string };

export type RosterSkillDefinition = { code: string; nameZh: string; category: string; skillMode: "PROGRESSIVE" | "BINARY" };
