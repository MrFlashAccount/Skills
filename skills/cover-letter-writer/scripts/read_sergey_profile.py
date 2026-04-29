#!/usr/bin/env python3
from pathlib import Path

PROFILE_PATH = Path('/Users/sergeygarin/Library/Mobile Documents/iCloud~md~obsidian/Documents/Career/Sergey master profile.md')


def main() -> int:
    print(PROFILE_PATH.read_text())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
