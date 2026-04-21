"""
OpenAI API 호출 비용 관측 + 일일 예산 가드.

- track(endpoint, prompt_tokens, completion_tokens, model)
- snapshot() — /health 에서 노출할 요약
- is_over_budget() — TOKEN_BUDGET_DAILY 초과 여부

In-memory 집계. 프로세스 재시작 시 초기화. Phase 1 규모에서 충분.
멀티 워커로 확장 시 redis 로 이관 (TODO).

가격: gpt-4o-mini 기준 (2026-04).
  입력  $0.150 / 1M tokens
  출력  $0.600 / 1M tokens
"""

from __future__ import annotations

import os
import threading
from collections import defaultdict
from datetime import date
from typing import Any

# USD per million tokens — 모델별. 확장 시 dict 에 추가.
_PRICING_PER_MTOK: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.150, "output": 0.600},
    "gpt-4o":      {"input": 2.500, "output": 10.00},
}

_DEFAULT_MODEL = "gpt-4o-mini"


def _price_for(model: str) -> dict[str, float]:
    # 모르는 모델은 mini 가격으로 추정 (과소추정 방지 어렵지만 근사).
    return _PRICING_PER_MTOK.get(model, _PRICING_PER_MTOK[_DEFAULT_MODEL])


class CostTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._day: date = date.today()
        # endpoint → {prompt_tokens, completion_tokens, calls, usd}
        self._by_endpoint: dict[str, dict[str, float]] = defaultdict(
            lambda: {"prompt_tokens": 0, "completion_tokens": 0, "calls": 0, "usd": 0.0}
        )
        self._total_tokens = 0
        self._total_usd = 0.0

    def _rollover_if_needed_locked(self) -> None:
        today = date.today()
        if today != self._day:
            self._day = today
            self._by_endpoint.clear()
            self._total_tokens = 0
            self._total_usd = 0.0

    def track(
        self,
        endpoint: str,
        prompt_tokens: int,
        completion_tokens: int,
        model: str = _DEFAULT_MODEL,
    ) -> None:
        price = _price_for(model)
        usd = (
            prompt_tokens * price["input"] / 1_000_000
            + completion_tokens * price["output"] / 1_000_000
        )
        with self._lock:
            self._rollover_if_needed_locked()
            bucket = self._by_endpoint[endpoint]
            bucket["prompt_tokens"] += prompt_tokens
            bucket["completion_tokens"] += completion_tokens
            bucket["calls"] += 1
            bucket["usd"] += usd
            self._total_tokens += prompt_tokens + completion_tokens
            self._total_usd += usd

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            self._rollover_if_needed_locked()
            return {
                "date": self._day.isoformat(),
                "tokensToday": self._total_tokens,
                "estimatedUsd": round(self._total_usd, 4),
                "byEndpoint": {
                    k: {
                        "calls": int(v["calls"]),
                        "promptTokens": int(v["prompt_tokens"]),
                        "completionTokens": int(v["completion_tokens"]),
                        "usd": round(v["usd"], 4),
                    }
                    for k, v in self._by_endpoint.items()
                },
                "dailyBudgetUsd": _daily_budget_usd(),
            }

    def is_over_budget(self) -> bool:
        budget = _daily_budget_usd()
        if budget is None:
            return False
        with self._lock:
            self._rollover_if_needed_locked()
            return self._total_usd >= budget


def _daily_budget_usd() -> float | None:
    """TOKEN_BUDGET_DAILY_USD 환경변수. 없으면 None (가드 off)."""
    raw = os.environ.get("TOKEN_BUDGET_DAILY_USD")
    if not raw:
        return None
    try:
        v = float(raw)
        return v if v > 0 else None
    except ValueError:
        return None


tracker = CostTracker()
