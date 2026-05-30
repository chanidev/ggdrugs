"""
Standalone i18n bundle generator.
Reads ko/<ns>.json, translates all values to target langs via OpenAI gpt-4o-mini,
merges into existing target-lang files (preserves already-translated keys),
saves results.
Usage: python scripts/translate-bundles.py
"""
import json
import os
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOCALES_DIR = SCRIPT_DIR.parent / "apps" / "web" / "public" / "locales"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY") or ""
LANGS = ["en", "vi", "zh", "ja", "fr"]
NAMESPACES = ["common", "navigation", "community", "mate", "chat", "uploader", "admin", "mypage"]
LANG_NAMES = {
    "en": "English",
    "vi": "Vietnamese",
    "zh": "Simplified Chinese",
    "ja": "Japanese",
    "fr": "French",
}


def openai_client():
    from openai import OpenAI
    return OpenAI(api_key=OPENAI_API_KEY)


def collect_leaf_keys(obj, prefix=""):
    keys = {}
    for k, v in obj.items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(collect_leaf_keys(v, path))
        else:
            keys[path] = v
    return keys


def set_nested(obj, dotted_key, value):
    parts = dotted_key.split(".")
    for part in parts[:-1]:
        obj = obj.setdefault(part, {})
    obj[parts[-1]] = value


def translate_chunk(ns, lang, chunk_keys, client):
    """Translate a dict of {dotted_key: korean_value} to target lang."""
    lang_name = LANG_NAMES[lang]
    prompt_json = json.dumps(chunk_keys, ensure_ascii=False, indent=2)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a professional UI translator for a Korean event discovery app called Alle. "
                    f"Translate the JSON object's string VALUES from Korean to {lang_name}. "
                    "Rules:\n"
                    "- Preserve all JSON keys exactly as-is (including dot notation).\n"
                    "- Preserve {{variable}} interpolation placeholders exactly.\n"
                    "- Keep the same JSON structure (flat dict with dotted keys).\n"
                    "- Return ONLY valid JSON, no markdown fences, no explanation.\n"
                    "- Translate naturally for a mobile UI context (short, clear labels)."
                ),
            },
            {"role": "user", "content": prompt_json},
        ],
        temperature=0.1,
        max_tokens=4000,
    )
    raw = (resp.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()
    return json.loads(raw)


def merge_translations(existing, new_flat):
    """Merge new flat translations into existing nested dict."""
    result = json.loads(json.dumps(existing))  # deep copy
    for dotted_key, value in new_flat.items():
        set_nested(result, dotted_key, value)
    return result


def main():
    if not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY not set")
        sys.exit(1)
    client = openai_client()
    failures = 0
    CHUNK_SIZE = 60  # keys per call

    for ns in NAMESPACES:
        ko_path = LOCALES_DIR / "ko" / f"{ns}.json"
        if not ko_path.exists():
            print(f"[skip] ko/{ns}.json not found")
            continue
        ko_data = json.loads(ko_path.read_text(encoding="utf-8"))
        ko_flat = collect_leaf_keys(ko_data)

        for lang in LANGS:
            target_path = LOCALES_DIR / lang / f"{ns}.json"
            target_path.parent.mkdir(parents=True, exist_ok=True)

            # Load existing translations
            if target_path.exists():
                existing = json.loads(target_path.read_text(encoding="utf-8"))
            else:
                existing = {}

            existing_flat = collect_leaf_keys(existing)

            # Find missing keys
            missing = {k: v for k, v in ko_flat.items() if k not in existing_flat}
            if not missing:
                print(f"  [OK] {lang}/{ns}.json - no missing keys")
                continue

            print(f"  Translating {len(missing)} missing keys in {lang}/{ns}.json ...")

            # Translate in chunks
            missing_items = list(missing.items())
            all_translated = {}
            chunk_failed = False
            for i in range(0, len(missing_items), CHUNK_SIZE):
                chunk = dict(missing_items[i:i+CHUNK_SIZE])
                try:
                    translated_chunk = translate_chunk(ns, lang, chunk, client)
                    all_translated.update(translated_chunk)
                    time.sleep(0.5)
                except Exception as e:
                    print(f"    ERROR chunk {i//CHUNK_SIZE+1}: {e}")
                    chunk_failed = True
                    failures += 1
                    break

            if not chunk_failed:
                # Merge and save
                merged = merge_translations(existing, all_translated)
                # Verify all ko keys present
                merged_flat = collect_leaf_keys(merged)
                still_missing = [k for k in ko_flat if k not in merged_flat]
                if still_missing:
                    print(f"    WARNING: {len(still_missing)} keys still missing after merge")
                    failures += 1
                else:
                    target_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    print(f"    saved {lang}/{ns}.json")

    if failures > 0:
        print(f"\n{failures} failure(s). Re-run to retry.")
        sys.exit(1)
    print("\nAll bundles updated successfully.")


if __name__ == "__main__":
    main()
