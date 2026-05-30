"""
Alle LLM — 번역 엔드포인트.

POST /translate-bundle  body: {namespace, lang, keys}  reply: {translated}
POST /translate-post    body: {content, target_lang}    reply: {translated}
"""
from __future__ import annotations
import os
import json as _json
from typing import Any

LANGUAGE_NAMES = {
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Simplified Chinese",
    "ja": "Japanese",
    "fr": "French",
}


def _openai_client():
    from openai import OpenAI
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def translate_bundle(namespace: str, lang: str, keys: dict[str, Any]) -> dict[str, Any]:
    """네임스페이스 JSON 전체를 한 번의 OpenAI 호출로 번역. 실패 시 예외 올림."""
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    client = _openai_client()
    prompt_json = _json.dumps(keys, ensure_ascii=False, indent=2)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a professional UI translator for a Korean event discovery app called Alle. "
                    f"Translate the JSON object's string VALUES from Korean to {lang_name}. "
                    "Rules:\n"
                    "- Preserve all JSON keys exactly as-is.\n"
                    "- Preserve {{variable}} interpolation placeholders exactly.\n"
                    "- Keep the same JSON structure.\n"
                    "- Return ONLY valid JSON, no markdown fences, no explanation.\n"
                    "- Translate naturally for a mobile UI context (short, clear labels)."
                ),
            },
            {"role": "user", "content": prompt_json},
        ],
        temperature=0.1,
        max_tokens=8000,
    )
    raw = (resp.choices[0].message.content or "").strip()
    # 마크다운 코드 펜스 제거
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    return _json.loads(raw)


def translate_post_content(content: str, target_lang: str) -> str:
    """게시글 본문 단일 텍스트 번역. 실패 시 예외 올림."""
    lang_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    client = _openai_client()
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a professional translator. "
                    f"Translate the user's Korean text to {lang_name}. "
                    "Preserve {{placeholders}} exactly. "
                    "Return only the translated text, no explanation."
                ),
            },
            {"role": "user", "content": content},
        ],
        temperature=0.2,
        max_tokens=4000,
    )
    return (resp.choices[0].message.content or "").strip()
