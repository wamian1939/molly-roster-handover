-- Expand-only foundation for Scoring System V1.
-- Period and all legacy evaluation fields remain unchanged for compatibility.
CREATE TYPE "SkillStatus" AS ENUM ('NotTrained', 'Training', 'Independent', 'Proficient');

ALTER TABLE "evaluations"
  ADD COLUMN "scoringVersion" TEXT NOT NULL DEFAULT 'legacy-v0';

CREATE TABLE "skill_definitions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameZh" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "weight" DECIMAL(6,3) NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "skill_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "skill_definitions_weight_positive" CHECK ("weight" > 0)
);

CREATE TABLE "employee_skills" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "skillDefinitionId" TEXT NOT NULL,
  "status" "SkillStatus" NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_skills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "skill_definitions_code_key" ON "skill_definitions"("code");
CREATE INDEX "skill_definitions_isActive_category_displayOrder_idx"
  ON "skill_definitions"("isActive", "category", "displayOrder");
CREATE UNIQUE INDEX "employee_skills_employeeId_skillDefinitionId_key"
  ON "employee_skills"("employeeId", "skillDefinitionId");
CREATE INDEX "employee_skills_employeeId_status_idx" ON "employee_skills"("employeeId", "status");
CREATE INDEX "employee_skills_skillDefinitionId_status_idx" ON "employee_skills"("skillDefinitionId", "status");

ALTER TABLE "employee_skills"
  ADD CONSTRAINT "employee_skills_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_skills"
  ADD CONSTRAINT "employee_skills_skillDefinitionId_fkey"
  FOREIGN KEY ("skillDefinitionId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "skill_definitions"
  ("id", "code", "nameZh", "nameEn", "category", "weight", "displayOrder", "isActive")
VALUES
  ('skill-tea-preparation', 'tea-preparation', '开茶', 'Tea Preparation', 'BackKitchen', 1.500, 10, true),
  ('skill-milk-bar', 'milk-bar', '奶吧', 'Milk Bar', 'BackKitchen', 1.500, 20, true),
  ('skill-cup-labeling', 'cup-labeling', '贴杯', 'Cup Labeling', 'Bar', 0.700, 30, true),
  ('skill-code-scanning', 'code-scanning', '扫码', 'Code Scanning', 'Bar', 0.700, 40, true),
  ('skill-ice-adding', 'ice-adding', '加冰', 'Ice Adding', 'Bar', 0.800, 50, true),
  ('skill-cup-spinning', 'cup-spinning', '炫杯', 'Cup Spinning', 'Bar', 1.000, 60, true),
  ('skill-transfer-station', 'transfer-station', '中转', 'Transfer Station', 'Front', 1.100, 70, true),
  ('skill-delivery-packing', 'delivery-packing', '外卖打包', 'Delivery Packing', 'Front', 0.800, 80, true),
  ('skill-drink-dispatch', 'drink-dispatch', '出杯', 'Drink Dispatch', 'Front', 1.000, 90, true),
  ('skill-order-taking', 'order-taking', '点单', 'Order Taking', 'Front', 1.400, 100, true);
