import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EvaluationV1Form } from "../components/evaluation-v1/EvaluationV1Form";
import { PageContainer } from "../components/layout/PageContainer";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { evaluationRepository } from "../services/evaluationRepository";
import type { EvaluationV1 } from "../types/evaluation";
import { resolveEvaluationBackTarget } from "../lib/evaluationNavigation";

export function EvaluationV1Page() {
  const { evaluationId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [evaluation, setEvaluation] = useState<EvaluationV1 | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!evaluationId) {
      setError("缺少评价编号。");
      return;
    }
    evaluationRepository.getEvaluationV1(evaluationId)
      .then((loaded) => {
        if (!cancelled) setEvaluation(loaded);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "无法加载评价。");
      });
    return () => { cancelled = true; };
  }, [evaluationId]);

  if (error) return <ErrorState title="评价暂不可用" description={error} />;
  if (!evaluation) return <LoadingState label="正在加载评价..." />;
  const backTarget = resolveEvaluationBackTarget({
    search: location.search,
    state: location.state,
    storeId: evaluation.storeId,
    employeeType: evaluation.employeeTypeSnapshot,
  });
  return <PageContainer><EvaluationV1Form initialEvaluation={evaluation} backTarget={backTarget} forceReadOnly={evaluation.evaluatorId !== user?.accountId} /></PageContainer>;
}
