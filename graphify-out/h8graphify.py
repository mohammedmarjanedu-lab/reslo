#!/usr/bin/env python
"""h8graphify - Headroom-wrapped graphify command.
Usage: h8graphify <graphify args...>

Auto-loads headroom compression before every graphify command.
"""
import sys, os
from pathlib import Path

h8_init = Path(__file__).parent / "headroom_init.py"
exec(h8_init.read_text(encoding="utf-8"))
os.environ["HEADROOM_ACTIVE"] = "1"

sys.stderr.write("[H8] Headroom compression active\n")

from graphify.__main__ import main
sys.argv = ["graphify"] + sys.argv[1:]
main()
