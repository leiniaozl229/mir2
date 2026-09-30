#!/usr/bin/env python3
"""Install accessible Woma Forest return services in an existing runtime."""

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_runtime", ROOT / "scripts/prepare-runtime.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def main():
    envir = ROOT / ".runtime/server/Mir200/Envir"
    merchants = envir / "Merchant.txt"
    if not merchants.is_file():
        raise SystemExit("Prepare the native runtime before installing forest services.")
    lines = prepare.read_text(merchants).splitlines()
    old_guide = "测试/世界向导 1 235 305 世界向导 0 5 0"
    lines = [line for line in lines if " ".join(line.split()) != old_guide]
    added = 0
    for script_name, x, y, display_name in prepare.FOREST_SERVICE_NPCS:
        definition = f"{script_name} 1 {x} {y} {display_name} 0 5 0"
        if definition not in lines:
            lines.append(definition)
            added += 1
    merchants.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")

    target = envir / "Market_Def/测试/森林回城-1.txt"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        prepare.read_text(ROOT / "content/classic-176/p0/forest-return.txt"),
        encoding="gb18030",
    )
    print(f"Forest NPC definitions added: {added}; old overlapping guide removed")


if __name__ == "__main__":
    main()
