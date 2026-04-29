#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = REPO_ROOT / "dist"
EXCLUDED_DIRS = {".git", "dist", "scripts", "__pycache__"}
ENV_VAR = "OPENCLAW_PACKAGE_SKILL"


def find_package_script() -> Path:
    env_value = os.environ.get(ENV_VAR)
    if env_value:
        candidate = Path(env_value).expanduser().resolve()
        if candidate.is_file():
            return candidate
        raise SystemExit(f"{ENV_VAR} points to a missing file: {candidate}")

    home = Path.home()
    home_patterns = [
        ".fnm/node-versions/*/installation/lib/node_modules/openclaw/skills/skill-creator/scripts/package_skill.py",
        ".npm-global/lib/node_modules/openclaw/skills/skill-creator/scripts/package_skill.py",
    ]
    fixed_candidates = [
        REPO_ROOT / "node_modules/openclaw/skills/skill-creator/scripts/package_skill.py",
        Path("/opt/homebrew/lib/node_modules/openclaw/skills/skill-creator/scripts/package_skill.py"),
        Path("/usr/local/lib/node_modules/openclaw/skills/skill-creator/scripts/package_skill.py"),
    ]

    for pattern in home_patterns:
        matches = sorted(home.glob(pattern))
        if matches:
            return matches[-1].resolve()

    for candidate in fixed_candidates:
        if candidate.is_file():
            return candidate.resolve()

    raise SystemExit(
        "Could not find package_skill.py automatically. "
        f"Set {ENV_VAR}=/path/to/package_skill.py and rerun."
    )


def discover_skills() -> list[Path]:
    skills: list[Path] = []
    for path in sorted(REPO_ROOT.iterdir()):
        if not path.is_dir() or path.name.startswith(".") or path.name in EXCLUDED_DIRS:
            continue
        if (path / "SKILL.md").is_file():
            skills.append(path)
    return skills


def resolve_targets(skill_names: list[str]) -> list[Path]:
    available = {skill.name: skill for skill in discover_skills()}
    if not skill_names:
        return list(available.values())

    missing = [name for name in skill_names if name not in available]
    if missing:
        raise SystemExit(f"Unknown skill(s): {', '.join(missing)}")

    return [available[name] for name in skill_names]


def clear_existing_archives(targets: list[Path], packaging_all: bool) -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    if packaging_all:
        for archive in DIST_DIR.glob("*.skill"):
            archive.unlink()
        return

    for skill in targets:
        archive = DIST_DIR / f"{skill.name}.skill"
        if archive.exists():
            archive.unlink()


def package_skill(package_script: Path, skill_dir: Path) -> None:
    command = [sys.executable, str(package_script), str(skill_dir), str(DIST_DIR)]
    print(f"\n==> Packaging {skill_dir.name}", flush=True)
    subprocess.run(command, check=True)


def main() -> int:
    targets = resolve_targets(sys.argv[1:])
    if not targets:
        raise SystemExit("No skill folders found in repo root.")

    package_script = find_package_script()
    print(f"Using packager: {package_script}", flush=True)

    packaging_all = len(sys.argv) == 1
    clear_existing_archives(targets, packaging_all)

    for skill_dir in targets:
        package_skill(package_script, skill_dir)

    print(f"\nDone. Wrote {len(targets)} package(s) to {DIST_DIR}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
