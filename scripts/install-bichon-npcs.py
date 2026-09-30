#!/usr/bin/env python3
"""Compatibility entry point for consolidated city services."""

import runpy
from pathlib import Path


runpy.run_path(str(Path(__file__).with_name("install-city-services.py")), run_name="__main__")
