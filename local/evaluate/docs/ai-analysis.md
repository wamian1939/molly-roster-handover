# AI Text Analysis

AI text analysis is advisory input to the server-authoritative evaluation preview. It never overrides manager-entered skill or rating data and never creates or saves an Evaluation by itself.

## Provider configuration

The backend supports the deterministic local analyzer for development/tests and DeepSeek through its OpenAI-compatible API. Provider credentials are backend-only environment values and must never be exposed to Vite, responses, logs, or source control.

Relevant variables are `AI_ANALYSIS_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `AI_ANALYSIS_TIMEOUT_MS`, `AI_ANALYSIS_MAX_RETRIES`, and `AI_ANALYSIS_RETRY_DELAY_MS`.

## Live evaluation endpoint

`POST /api/evaluation-rounds/:roundId/analyze-my-evaluation`

The request contains the current in-memory evaluation input. The response supplies advisory text/risk scores, summary, strengths, improvement areas, and dimension evidence for preview. The caller must explicitly submit through `PUT /api/evaluation-rounds/:roundId/my-evaluation` to persist the complete score.

Analyzing and then leaving the form without submitting leaves the database submission unchanged. If an evaluator already has a saved score, an unsubmitted re-analysis does not replace it.

## Audit and privacy

Provider runs store the employee/round/evaluator context, provider/model status, latency, the submitted review snapshot, and structured result or safe failure. API keys, authorization headers, full prompts, and protected employee profile fields are never stored in run metadata.

AI rows linked to a CLOSED round are immutable. A store evaluator may analyze only for an employee in their assigned store; ADMIN may analyze across stores. Archived employees and CLOSED rounds reject new analysis.

Transient network, timeout, `429`, and `5xx` failures may retry within configured limits. Validation, authorization, configuration, and invalid provider-output failures are not silently converted to local results.
