#!/usr/bin/env python3
"""Fail if en/ar translation keys differ."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EN = ROOT / "frontend" / "src" / "i18n" / "locales" / "en" / "translation.json"
AR = ROOT / "frontend" / "src" / "i18n" / "locales" / "ar" / "translation.json"


def flatten(obj, prefix=""):
    keys = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{prefix}.{k}" if prefix else k
            keys |= flatten(v, p)
    else:
        keys.add(prefix)
    return keys


def main() -> int:
    if not EN.exists() or not AR.exists():
        print("Locale files missing — skip until frontend i18n lands")
        return 0
    en = flatten(json.loads(EN.read_text(encoding="utf-8")))
    ar = flatten(json.loads(AR.read_text(encoding="utf-8")))
    only_en = sorted(en - ar)
    only_ar = sorted(ar - en)
    if only_en or only_ar:
        if only_en:
            print("Missing in AR:", *only_en, sep="\n  ")
        if only_ar:
            print("Missing in EN:", *only_ar, sep="\n  ")
        return 1
    print(f"OK — {len(en)} keys match")
    return 0


if __name__ == "__main__":
    sys.exit(main())
