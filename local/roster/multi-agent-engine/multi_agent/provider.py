"""Replaceable structured-output provider. No access to schedule state or database."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol
import httpx


PROMPTS = Path(__file__).parent / "prompts"


class Provider(Protocol):
    name: str
    def generate(self, agent: str, payload: dict, schema: dict) -> tuple[dict, dict]: ...


class AnthropicProvider:
    name = "anthropic"

    def __init__(self):
        self.key = os.getenv("MULTI_AGENT_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")
        self.base = (os.getenv("MULTI_AGENT_BASE_URL") or os.getenv("ANTHROPIC_BASE_URL") or "https://api.anthropic.com").rstrip("/")
        self.model = os.getenv("MULTI_AGENT_MODEL") or os.getenv("ANTHROPIC_MODEL")
        if not self.key or not self.model:
            raise ValueError("Configure MULTI_AGENT_API_KEY and MULTI_AGENT_MODEL (or Anthropic environment equivalents)")

    def generate(self, agent, payload, schema):
        prompt_name='daily_select' if agent=='daily' and payload.get('interaction_mode')=='SELECT_ONE' else agent
        system = (PROMPTS / f"{prompt_name}.txt").read_text(encoding="utf-8")
        model = os.getenv(f"MULTI_AGENT_{agent.upper()}_MODEL") or self.model
        thinking_enabled=os.getenv("MULTI_AGENT_THINKING", "disabled")=="enabled"
        base = self.base if self.base.endswith("/v1") else self.base+"/v1"
        # Credentials never enter prompts, traces, API responses or exception strings.
        with httpx.Client(timeout=float(os.getenv("MULTI_AGENT_TIMEOUT_SECONDS", "180"))) as client:
            response = client.post(base+"/messages", headers={"x-api-key":self.key,
                "authorization":"Bearer "+self.key,"anthropic-version":"2023-06-01"}, json={
                "model":model,"max_tokens":12288,"system":system,
                "thinking":{"type":"enabled","budget_tokens":4096} if thinking_enabled else {"type":"disabled"},
                "tools":[{"name":"submit_result","description":"Submit this agent's structured result", "input_schema":schema}],
                "tool_choice":{"type":"auto"} if thinking_enabled else {"type":"tool","name":"submit_result"},
                "messages":[{"role":"user","content":json.dumps(payload,ensure_ascii=False,default=str)}]})
        if not response.is_success:
            raise RuntimeError(f"LLM provider HTTP {response.status_code}; check secure configuration/provider logs")
        data = response.json()
        usage = data.get("usage", {})
        inp, out = usage.get("input_tokens",0), usage.get("output_tokens",0)
        input_rate, output_rate = os.getenv("MULTI_AGENT_INPUT_USD_PER_MILLION"), os.getenv("MULTI_AGENT_OUTPUT_USD_PER_MILLION")
        cost = (inp*float(input_rate)+out*float(output_rate))/1_000_000 if input_rate and output_rate else None
        metadata = {"model":data.get("model",model),"input_tokens":inp,"output_tokens":out,
                    "cache_read_input_tokens":usage.get("cache_read_input_tokens",0),
                    "cache_creation_input_tokens":usage.get("cache_creation_input_tokens",0),
                    "cost_usd":cost,"cost_status":"CONFIGURED_ESTIMATE_EXCLUDES_CACHE" if cost is not None else "UNKNOWN"}
        blocks = [b["input"] for b in data.get("content",[]) if b.get("type")=="tool_use" and b.get("name")=="submit_result"]
        if len(blocks) != 1 or data.get("stop_reason")=="max_tokens":
            return {"provider_output_error":"Expected exactly one complete submit_result tool output",
                    "stop_reason":data.get("stop_reason"),"content":data.get("content",[])},metadata
        return blocks[0], metadata
