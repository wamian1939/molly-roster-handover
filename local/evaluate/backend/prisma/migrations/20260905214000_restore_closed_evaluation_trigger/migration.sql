-- Restore the main Evaluation immutability trigger after the live-status enum rebuild.
-- Both the previous and next round are checked so a row cannot be moved into or
-- out of a CLOSED round to bypass the historical boundary.
DROP TRIGGER IF EXISTS "evaluations_closed_round_immutable" ON "evaluations";
CREATE TRIGGER "evaluations_closed_round_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "evaluations"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_evaluation_mutation();
