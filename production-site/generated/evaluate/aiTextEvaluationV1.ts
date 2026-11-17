import {runtimeEnv} from '../../server/runtime-env.mjs';
import { z } from "zod";
import type { SkillStatusV1 } from "./scoringPolicyV1.js";

const possibleSkillUpdateSchema = z.object({
  skillCode: z.string().trim().min(1).max(100),
  suggestedStatus: z.enum(["NotTrained", "Training", "Independent", "Proficient"]),
  message: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

const modelResultSchema = z.object({
  textScore: z.number(),
  positiveEvidence: z.array(z.string().trim().min(1).max(500)).max(20),
  concernEvidence: z.array(z.string().trim().min(1).max(500)).max(20),
  possibleSkillUpdates: z.array(possibleSkillUpdateSchema).max(20),
}).strict();

export type PossibleSkillUpdateV1 = {
  skillCode: string;
  suggestedStatus: SkillStatusV1;
  message: string;
  confidence?: number;
};

export type AiTextResultV1 = {
  textScore: number;
  positiveEvidence: string[];
  concernEvidence: string[];
  possibleSkillUpdates: PossibleSkillUpdateV1[];
  provider: string;
  model: string;
  rawResponse: unknown;
};

export interface TextAnalyzerV1 {
  analyze(textFeedback: string): Promise<AiTextResultV1>;
}

export class AiTextEvaluationV1Service implements TextAnalyzerV1 {
  async analyze(textFeedback: string): Promise<AiTextResultV1> {
    if (runtimeEnv.AI_ANALYSIS_PROVIDER !== "deepseek") {
      throw new Error("External AI text evaluation is not configured.");
    }
    const apiKey = runtimeEnv.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DeepSeek API key is not configured.");

    const model = runtimeEnv.DEEPSEEK_MODEL ?? "deepseek-chat";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), readPositiveNumber("AI_ANALYSIS_TIMEOUT_MS", 15000));

    try {
      const response = await fetch(`${readBaseUrl()}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Return strict JSON with only textScore (0-10), positiveEvidence, concernEvidence, and possibleSkillUpdates. Never return overall score, tier, skill score, risk score, or other component scores. Skill suggestions are advisory only.",
            },
            {
              role: "user",
              content: JSON.stringify({ textFeedback }),
            },
          ],
        }),
      });

      if (!response.ok) throw new Error(`DeepSeek text evaluation failed with status ${response.status}.`);
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek text evaluation returned an empty response.");
      const rawResponse = JSON.parse(content) as unknown;
      const parsed = modelResultSchema.parse(rawResponse);

      return {
        ...parsed,
        textScore: clamp(round1(parsed.textScore), 0, 10),
        provider: "deepseek",
        model,
        rawResponse,
      };
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error("AI text evaluation timed out.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readBaseUrl() {
  return (runtimeEnv.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
}

function readPositiveNumber(name: string, fallback: number) {
  const value = Number(runtimeEnv[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
