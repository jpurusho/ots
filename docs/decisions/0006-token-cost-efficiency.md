# 0006 — Token Cost Efficiency Guidelines

**Status:** accepted  
**Date:** 2026-06-15

## Context

A "simple fix" session consumed 2.29M input tokens (50 turns, $2.43) — mostly from:
- Repeated file re-reads (checking files already edited)
- Long back-and-forth conversations (multiple rounds to settle on approach)
- Context accumulation (conversation history grows with each turn)

Token cost scales with conversation length and file reads. Without discipline, even small tasks can burn $2-5 when they could cost $0.20-0.50.

## Decision

Add cost-efficiency guidelines to CLAUDE.md template (via ~/bin/claude-init) and OTS CLAUDE.md:

1. **Batch work** — answer all parts of multi-part questions in one turn
2. **Read once, act once** — don't re-read files just edited (Edit/Write fails loudly if broken)
3. **Check memory/ADRs first** — before asking "what did we decide?"
4. **Use Explore for broad searches** — keeps grep output out of main context
5. **Be decisive** — when path is clear, act; don't enumerate unused options
6. **/clear after milestones** — CLAUDE.md + ADRs + memory are the durable state

These are **behavior guidelines for Claude**, not workflow restrictions. The goal is to reduce unnecessary token consumption without sacrificing quality.

## Consequences

**Positive:**
- Simple fixes should cost $0.20-0.50 instead of $2-5
- Clear guidance for when to /clear (after milestones, not mid-task)
- Encourages decisive action over exploration when the path is obvious

**Risks:**
- Could make Claude too terse or skip necessary exploration
- Mitigation: guidelines emphasize "when path is clear" and "unnecessary reads" — not banning all exploration

**Template change:**
- `~/bin/claude-init` now includes this section in all new projects
- Existing projects need manual update to CLAUDE.md

## Why This Matters

Token cost is real. 50-turn sessions for simple fixes are avoidable. Discipline (batching, reading once, /clear often) saves tokens. Tokens save dollars. The spec, ADRs, and memory on disk are free to load; conversation context is expensive.
