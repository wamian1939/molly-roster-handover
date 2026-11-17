import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { forwardEvaluationNavigation } from "../lib/evaluationNavigation";
import { evaluationRepository } from "../services/evaluationRepository";

export function EvaluationEntryPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!employeeId) {
      setError("开始评分需要有效的员工。");
      return;
    }
    evaluationRepository.startLiveScoring(employeeId)
      .then((context) => {
        const target = forwardEvaluationNavigation(
          `/evaluation-rounds/${context.roundId}/my-score`,
          location.search,
          location.state,
        );
        navigate(target.to, { replace: true, state: target.state });
      })
      .catch((createError: unknown) => {
        setError(createError instanceof Error ? createError.message : "无法准备本轮评分。");
      });
  }, [employeeId, location.search, location.state, navigate]);

  if (error) return <ErrorState title="无法开始评分" description={error} />;
  return <LoadingState label="正在准备员工评价" />;
}
