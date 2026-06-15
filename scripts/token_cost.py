#!/usr/bin/env python3
"""
Sum token usage across all Claude Code sessions for this project.

Usage:
    python3 scripts/token_cost.py [--by-day] [--rates path]

Reads transcripts from ~/.claude/projects/<sanitized-project-path>/
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path


def sanitize_path(p: str) -> str:
    """Convert /foo/bar to -foo-bar (Claude's project dir convention)."""
    return p.replace("/", "-")


def get_project_dir() -> Path:
    """Derive the Claude project directory for the current working directory."""
    cwd = Path.cwd().resolve()
    sanitized = sanitize_path(str(cwd))
    return Path.home() / ".claude" / "projects" / sanitized


# Approximate public pricing ($ per million tokens) for Claude 4 family.
DEFAULT_RATES = {
    "opus": {
        "input": 15.0, "output": 75.0,
        "cache_write_5m": 18.75, "cache_write_1h": 30.0, "cache_read": 1.50,
    },
    "sonnet": {
        "input": 3.0, "output": 15.0,
        "cache_write_5m": 3.75, "cache_write_1h": 6.0, "cache_read": 0.30,
    },
    "haiku": {
        "input": 1.0, "output": 5.0,
        "cache_write_5m": 1.25, "cache_write_1h": 2.0, "cache_read": 0.10,
    },
    "default": {
        "input": 15.0, "output": 75.0,
        "cache_write_5m": 18.75, "cache_write_1h": 30.0, "cache_read": 1.50,
    },
}


def rate_for(model: str | None, rates: dict) -> dict:
    if not model:
        return rates["default"]
    m = model.lower()
    for key in ("opus", "sonnet", "haiku"):
        if key in m and key in rates:
            return rates[key]
    return rates["default"]


def iter_jsonl(path: Path):
    with path.open("r", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def collect_usages(jsonl_path: Path):
    for entry in iter_jsonl(jsonl_path):
        msg = entry.get("message")
        if not isinstance(msg, dict):
            continue
        usage = msg.get("usage")
        if not isinstance(usage, dict):
            continue
        ts = entry.get("timestamp") or entry.get("createdAt")
        model = msg.get("model")
        yield ts, model, usage


def sum_session(jsonl_path: Path):
    totals = defaultdict(int)
    by_model = defaultdict(lambda: defaultdict(int))
    by_day = defaultdict(lambda: defaultdict(int))
    turns = 0

    for ts, model, u in collect_usages(jsonl_path):
        turns += 1
        cache = u.get("cache_creation") or {}
        fields = {
            "input": int(u.get("input_tokens") or 0),
            "output": int(u.get("output_tokens") or 0),
            "cache_read": int(u.get("cache_read_input_tokens") or 0),
            "cache_write_5m": int(cache.get("ephemeral_5m_input_tokens") or 0),
            "cache_write_1h": int(cache.get("ephemeral_1h_input_tokens") or 0),
        }
        if not fields["cache_write_5m"] and not fields["cache_write_1h"]:
            legacy_write = int(u.get("cache_creation_input_tokens") or 0)
            fields["cache_write_5m"] = legacy_write

        for k, v in fields.items():
            totals[k] += v
            by_model[model or "?"][k] += v
            if ts:
                day = ts[:10]
                by_day[day][k] += v

    return {
        "turns": turns,
        "totals": dict(totals),
        "by_model": {m: dict(d) for m, d in by_model.items()},
        "by_day": {d: dict(v) for d, v in by_day.items()},
    }


def cost_of(totals: dict, rates: dict) -> float:
    cost = 0.0
    for k, n in totals.items():
        per_million = rates.get(k, 0.0)
        cost += (n / 1_000_000.0) * per_million
    return cost


def fmt_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n/1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}k"
    return str(n)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--by-day", action="store_true")
    ap.add_argument("--rates", help="Path to JSON file overriding pricing")
    ap.add_argument("--project-dir", help="Override auto-detected project dir")
    ap.add_argument("--summary", action="store_true", help="Show concise summary (current session + cumulative)")
    args = ap.parse_args(argv)

    rates = DEFAULT_RATES
    if args.rates:
        with open(args.rates) as f:
            rates = json.load(f)

    project_dir = Path(args.project_dir) if args.project_dir else get_project_dir()
    if not project_dir.exists():
        print(f"No transcripts at {project_dir}", file=sys.stderr)
        return 1

    main_files = sorted(project_dir.glob("*.jsonl"))
    sub_files = sorted(project_dir.glob("*/subagents/agent-*.jsonl"))

    # Find current session (most recently modified main file)
    current_session_path = None
    if main_files:
        current_session_path = max(main_files, key=lambda p: p.stat().st_mtime)

    grand_totals = defaultdict(int)
    grand_by_model = defaultdict(lambda: defaultdict(int))
    grand_by_day = defaultdict(lambda: defaultdict(int))
    grand_turns = 0
    sessions_summary = []

    current_session_data = None
    current_session_cost = 0.0

    for path in main_files + sub_files:
        s = sum_session(path)
        if s["turns"] == 0:
            continue
        kind = "main" if path in main_files else "subagent"
        file_cost = sum(cost_of(d, rate_for(model, rates)) for model, d in s["by_model"].items())
        sessions_summary.append((kind, path.name, s, file_cost))

        # Track current session separately
        if path == current_session_path:
            current_session_data = s
            current_session_cost = file_cost

        for k, v in s["totals"].items():
            grand_totals[k] += v
        for m, d in s["by_model"].items():
            for k, v in d.items():
                grand_by_model[m][k] += v
        for day, d in s["by_day"].items():
            for k, v in d.items():
                grand_by_day[day][k] += v
        grand_turns += s["turns"]

    project_name = Path.cwd().name

    # If --summary flag, show concise format
    if args.summary and current_session_data:
        print()
        print("=" * 72)
        print(f"Token Usage Summary — {project_name}")
        print("=" * 72)
        print()

        # Current session
        print("CURRENT SESSION (since last /clear):")
        print("-" * 72)
        curr_in = (current_session_data["totals"].get("input", 0) +
                   current_session_data["totals"].get("cache_read", 0) +
                   current_session_data["totals"].get("cache_write_5m", 0) +
                   current_session_data["totals"].get("cache_write_1h", 0))
        curr_out = current_session_data["totals"].get("output", 0)
        curr_cache_read = current_session_data["totals"].get("cache_read", 0)

        print(f"  Turns:              {current_session_data['turns']:>6}")
        print(f"  Input tokens:       {fmt_tokens(curr_in):>8}  ({curr_in:,})")
        print(f"  Output tokens:      {fmt_tokens(curr_out):>8}  ({curr_out:,})")
        print(f"  Cache read:         {fmt_tokens(curr_cache_read):>8}  ({curr_cache_read:,})")
        print(f"  Cost:               ${current_session_cost:>7.2f}")
        print()

        # Model breakdown for current session
        if len(current_session_data["by_model"]) > 1:
            print("  Models used:")
            for model, d in sorted(current_session_data["by_model"].items(), key=lambda x: -sum(x[1].values())):
                m_cost = cost_of(d, rate_for(model, rates))
                print(f"    {model:<35} ${m_cost:>7.2f}")
            print()

        # Cumulative (all sessions)
        print("CUMULATIVE (all sessions to date):")
        print("-" * 72)
        cum_in = (grand_totals["input"] + grand_totals["cache_read"] +
                  grand_totals["cache_write_5m"] + grand_totals["cache_write_1h"])
        cum_out = grand_totals["output"]
        cum_cache_read = grand_totals["cache_read"]
        total_cost = sum(c for _, _, _, c in sessions_summary)

        print(f"  Total turns:        {grand_turns:>6}")
        print(f"  Input tokens:       {fmt_tokens(cum_in):>8}  ({cum_in:,})")
        print(f"  Output tokens:      {fmt_tokens(cum_out):>8}  ({cum_out:,})")
        print(f"  Cache read:         {fmt_tokens(cum_cache_read):>8}  ({cum_cache_read:,})")
        print(f"  Total cost:         ${total_cost:>7.2f}")
        print()

        # Top models (cumulative)
        print("  Top models:")
        sorted_models = sorted(grand_by_model.items(), key=lambda x: cost_of(x[1], rate_for(x[0], rates)), reverse=True)
        for model, d in sorted_models[:3]:  # Top 3
            m_cost = cost_of(d, rate_for(model, rates))
            print(f"    {model:<35} ${m_cost:>7.2f}")
        print()

        print("=" * 72)
        print()
        print("Note: Cost estimate uses approximate public pricing for Claude 4 family.")
        print("      If on Claude Code Pro/Max plan, this is an API-equivalent estimate.")
        print()
        return 0

    # Otherwise, show full detailed report
    print("=" * 72)
    print(f"{project_name} — token cost summary  ({len(sessions_summary)} files)")
    print("=" * 72)
    print()

    print(f"{'Kind':<10} {'File':<48} {'Turns':>6} {'$':>9}")
    print("-" * 76)
    total_cost = 0.0
    for kind, name, s, c in sessions_summary:
        total_cost += c
        short = name if len(name) <= 47 else name[:44] + "..."
        print(f"{kind:<10} {short:<48} {s['turns']:>6} {c:>9.2f}")
    print("-" * 76)
    print(f"{'TOTAL':<10} {'':<48} {grand_turns:>6} {total_cost:>9.2f}")
    print()

    print("Token totals (across all sessions, all models):")
    for k in ("input", "output", "cache_read", "cache_write_5m", "cache_write_1h"):
        print(f"  {k:<18} {grand_totals[k]:>15,}  ({fmt_tokens(grand_totals[k])})")
    grand_in = grand_totals["input"] + grand_totals["cache_read"] + grand_totals["cache_write_5m"] + grand_totals["cache_write_1h"]
    print(f"  {'TOTAL INPUT':<18} {grand_in:>15,}  ({fmt_tokens(grand_in)})")
    print(f"  {'TOTAL OUTPUT':<18} {grand_totals['output']:>15,}  ({fmt_tokens(grand_totals['output'])})")
    print()

    print("By model:")
    for m, d in sorted(grand_by_model.items(), key=lambda x: -sum(x[1].values())):
        m_in = d.get("input", 0) + d.get("cache_read", 0) + d.get("cache_write_5m", 0) + d.get("cache_write_1h", 0)
        m_out = d.get("output", 0)
        m_cost = cost_of(d, rate_for(m, rates))
        print(f"  {m:<40} in={fmt_tokens(m_in):>8}  out={fmt_tokens(m_out):>8}  ${m_cost:>8.2f}")
    print()

    if args.by_day:
        print("By day:")
        for day in sorted(grand_by_day):
            d = grand_by_day[day]
            day_in = d.get("input", 0) + d.get("cache_read", 0) + d.get("cache_write_5m", 0) + d.get("cache_write_1h", 0)
            print(f"  {day}  in={fmt_tokens(day_in):>8}  out={fmt_tokens(d.get('output', 0)):>8}")
        print()

    print(f"Estimated total cost:  ${total_cost:.2f}")
    print()
    print("Note: cost estimate uses approximate public pricing for the Claude")
    print("4 family (Opus / Sonnet / Haiku). Cache reads ~10% of input; cache")
    print("writes ~25% above input. If you're on a flat-rate Claude Code plan")
    print("(Pro/Max), the dollar figure is an API-equivalent estimate, not a")
    print("real charge. Override with --rates RATES.json to plug in current")
    print("pricing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
