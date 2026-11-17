-- A transfer changes ownership metadata only. CLOSED scores, evaluator
-- memberships, policies, timestamps and all other snapshots remain protected.
CREATE OR REPLACE FUNCTION prevent_closed_round_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'CLOSED' THEN
    IF TG_OP = 'UPDATE'
      AND (to_jsonb(NEW) - ARRAY['storeId', 'storeNameSnapshot']) = (to_jsonb(OLD) - ARRAY['storeId', 'storeNameSnapshot'])
      AND EXISTS (SELECT 1 FROM employees e JOIN stores s ON s.id = e."storeId"
        WHERE e.id = NEW."employeeId" AND e."storeId" = NEW."storeId" AND s.name = NEW."storeNameSnapshot")
    THEN RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Closed rounds are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_closed_round_evaluation_mutation()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM evaluation_rounds WHERE id IN (
    CASE WHEN TG_OP <> 'INSERT' THEN OLD."roundId" ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW."roundId" ELSE NULL END
  ) AND status = 'CLOSED') THEN
    IF TG_OP = 'UPDATE'
      AND (to_jsonb(NEW) - ARRAY['storeId', 'storeNameSnapshot']) = (to_jsonb(OLD) - ARRAY['storeId', 'storeNameSnapshot'])
      AND EXISTS (SELECT 1 FROM evaluation_rounds r JOIN employees e ON e.id = r."employeeId"
        JOIN stores s ON s.id = e."storeId"
        WHERE r.id = NEW."roundId" AND r."employeeId" = NEW."employeeId"
          AND r."storeId" = NEW."storeId" AND e."storeId" = NEW."storeId"
          AND (NEW."storeNameSnapshot" IS NOT DISTINCT FROM OLD."storeNameSnapshot" OR NEW."storeNameSnapshot" = s.name))
    THEN RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Closed round evaluations are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
