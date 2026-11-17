-- Enforce that an Evaluation cannot point at a Round for another Employee or Store.
CREATE UNIQUE INDEX "evaluation_rounds_id_employeeId_storeId_key"
  ON "evaluation_rounds"("id", "employeeId", "storeId");

ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_roundId_fkey";

ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_roundId_employeeId_storeId_fkey"
  FOREIGN KEY ("roundId", "employeeId", "storeId")
  REFERENCES "evaluation_rounds"("id", "employeeId", "storeId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
