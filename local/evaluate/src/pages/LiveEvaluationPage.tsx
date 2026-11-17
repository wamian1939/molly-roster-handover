import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { EvaluationV1Form } from "../components/evaluation-v1/EvaluationV1Form";
import { PageContainer } from "../components/layout/PageContainer";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { resolveEvaluationBackTarget } from "../lib/evaluationNavigation";
import { evaluationRepository } from "../services/evaluationRepository";
import type { EvaluationV1 } from "../types/evaluation";

export function LiveEvaluationPage() {
  const { roundId } = useParams();
  const location = useLocation();
  const [evaluation, setEvaluation] = useState<EvaluationV1 | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!roundId) { setError("缺少轮次编号。"); return; }
    evaluationRepository.fetchLiveScoringContext(roundId)
      .then((value) => { if (active) setEvaluation(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "无法加载评分页面。"); });
    return () => { active = false; };
  }, [roundId]);

  if (error) return <ErrorState title="评分页面暂不可用" description={error} />;
  if (!evaluation) return <LoadingState label="正在加载本轮评分" />;
  const backTarget = resolveEvaluationBackTarget({ search: location.search, state: location.state, storeId: evaluation.storeId, employeeType: evaluation.employeeTypeSnapshot });
  return <PageContainer><EvaluationV1Form initialEvaluation={evaluation} backTarget={backTarget} live /></PageContainer>;
}
