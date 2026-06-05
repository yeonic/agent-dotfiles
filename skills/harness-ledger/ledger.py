#!/usr/bin/env python3
"""Harness ledger: track decisions and reconcile them against the real repo.

Design principle: the filesystem is the source of truth for *existence*; a
ledger note carries only the *narrative + intended status*. `audit` cross-checks
the two and reports drift, so the ledger manages itself instead of rotting.

Records live in docs/ledger/decisions/NNNN-slug.md with YAML frontmatter:

    ---
    id: 0003
    title: checkpoint on long autonomous runs
    date: 2026-06-05
    status: experimental        # proposed | experimental | permanent | reverted
    knob: docs/experimental      # which lever was pulled
    target: docs/experimental/checkpoint.md   # the actual artifact (for audit)
    evidence: long unattended stretches 15-31/day (evolve-harness)
    review_by: 2026-06-12        # experimental only: when to judge
    tags: [autonomy, rule]
    ---

Commands:
    ledger.py new --title T --status S --knob K --target P --evidence E [--review-by D] [--tags a,b]
    ledger.py list [--status S]
    ledger.py audit
    ledger.py set ID STATUS
"""

import argparse
import datetime as dt
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.realpath(__file__)), "..", ".."))
DECISIONS = os.path.join(ROOT, "docs", "ledger", "decisions")
EXPERIMENTAL = os.path.join(ROOT, "docs", "experimental")
INTEGRATED = os.path.join(ROOT, "docs", "integrated")

STATUSES = ["proposed", "experimental", "permanent", "reverted"]


# --- tiny frontmatter parser (flat keys + [list] for tags) -------------------

def parse_note(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.DOTALL)
    if not m:
        return None
    fm, body = {}, m.group(2)
    for line in m.group(1).splitlines():
        if not line.strip() or ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            v = [x.strip() for x in v[1:-1].split(",") if x.strip()]
        fm[k] = v
    fm["_path"] = path
    fm["_body"] = body
    return fm


def load_all():
    if not os.path.isdir(DECISIONS):
        return []
    notes = []
    for fn in sorted(os.listdir(DECISIONS)):
        if fn.endswith(".md") and re.match(r"\d{4}-", fn):
            n = parse_note(os.path.join(DECISIONS, fn))
            if n:
                notes.append(n)
    return notes


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48]


def next_id(notes):
    ids = [int(n["id"]) for n in notes if str(n.get("id", "")).isdigit()]
    return f"{(max(ids) + 1) if ids else 1:04d}"


def exists(target):
    """Where does the target artifact currently live?"""
    if not target:
        return "none"
    p = os.path.join(ROOT, target)
    if not os.path.exists(p):
        return "missing"
    if os.path.normpath(p).startswith(os.path.normpath(EXPERIMENTAL) + os.sep):
        return "experimental"
    if os.path.normpath(p).startswith(os.path.normpath(INTEGRATED) + os.sep):
        return "integrated"
    return "present"


# --- commands ----------------------------------------------------------------

def cmd_new(a):
    notes = load_all()
    nid = next_id(notes)
    os.makedirs(DECISIONS, exist_ok=True)
    path = os.path.join(DECISIONS, f"{nid}-{slugify(a.title)}.md")
    fm = [
        "---",
        f"id: {nid}",
        f"title: {a.title}",
        f"date: {dt.date.today().isoformat()}",
        f"status: {a.status}",
        f"knob: {a.knob}",
        f"target: {a.target}",
        f"evidence: {a.evidence}",
    ]
    if a.review_by:
        fm.append(f"review_by: {a.review_by}")
    elif a.status == "experimental":
        fm.append(f"review_by: {(dt.date.today() + dt.timedelta(days=7)).isoformat()}")
    fm.append(f"tags: [{a.tags}]")
    fm.append("---")
    body = f"\n# {a.title}\n\n## Why\n{a.evidence}\n\n## What\n\n## Links\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(fm) + "\n" + body)
    print(f"recorded {nid}: {path}")


def cmd_list(a):
    notes = load_all()
    if a.status:
        notes = [n for n in notes if n.get("status") == a.status]
    if not notes:
        print("(no records)")
        return
    print("| id | status | title | target | review_by |")
    print("|----|--------|-------|--------|-----------|")
    for n in notes:
        print(f"| {n.get('id','?')} | {n.get('status','?')} | {n.get('title','?')[:40]} "
              f"| {n.get('target','-')} | {n.get('review_by','-')} |")


def cmd_set(a):
    notes = load_all()
    note = _find(notes, a.id)
    if not note:
        print(f"no record with id {a.id}", file=sys.stderr)
        sys.exit(1)
    if a.status not in STATUSES:
        print(f"status must be one of {STATUSES}", file=sys.stderr)
        sys.exit(1)
    text = open(note["_path"], encoding="utf-8").read()
    text = re.sub(r"^status:.*$", f"status: {a.status}", text, count=1, flags=re.MULTILINE)
    if f"\ndecided:" not in text:
        text = re.sub(r"^(status:.*)$", rf"\1\ndecided: {dt.date.today().isoformat()}",
                      text, count=1, flags=re.MULTILINE)
    else:
        text = re.sub(r"^decided:.*$", f"decided: {dt.date.today().isoformat()}", text, count=1, flags=re.MULTILINE)
    with open(note["_path"], "w", encoding="utf-8") as f:
        f.write(text)
    print(f"{note['id']} -> {a.status}")


def _update_fm(path, **kv):
    text = open(path, encoding="utf-8").read()
    for k, v in kv.items():
        if re.search(rf"^{k}:.*$", text, flags=re.MULTILINE):
            text = re.sub(rf"^{k}:.*$", f"{k}: {v}", text, count=1, flags=re.MULTILINE)
        else:
            text = re.sub(r"^(status:.*)$", rf"\1\n{k}: {v}", text, count=1, flags=re.MULTILINE)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def _find(notes, idstr):
    return next((n for n in notes if str(n.get("id")) in (idstr, idstr.zfill(4))), None)


def _run_build():
    build = os.path.join(ROOT, "build.sh")
    if os.path.exists(build):
        import subprocess
        subprocess.run(["bash", build], check=False)


def cmd_graduate(a):
    """Promote an experimental rule to permanent: move file -> integrated, rebuild, relabel.
    The agent runs this after the user confirms; the user never moves files."""
    note = _find(load_all(), a.id)
    if not note:
        print(f"no record with id {a.id}", file=sys.stderr); sys.exit(1)
    tgt = note.get("target", "")
    if exists(tgt) != "experimental":
        print(f"{a.id}: target `{tgt}` is not in docs/experimental/ — cannot graduate", file=sys.stderr)
        sys.exit(1)
    src = os.path.join(ROOT, tgt)
    new_rel = os.path.join("docs", "integrated", os.path.basename(tgt))
    dst = os.path.join(ROOT, new_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    os.replace(src, dst)
    _update_fm(note["_path"], status="permanent", target=new_rel, decided=dt.date.today().isoformat())
    _run_build()
    print(f"graduated {note['id']}: {tgt} -> {new_rel} (status=permanent, AGENTS.md rebuilt)")


def cmd_revert(a):
    """Drop an experimental rule: remove the file, mark reverted. Agent runs post-confirm."""
    note = _find(load_all(), a.id)
    if not note:
        print(f"no record with id {a.id}", file=sys.stderr); sys.exit(1)
    tgt = note.get("target", "")
    p = os.path.join(ROOT, tgt)
    if exists(tgt) == "experimental" and os.path.exists(p):
        os.remove(p)
    _update_fm(note["_path"], status="reverted", decided=dt.date.today().isoformat())
    print(f"reverted {note['id']}: removed `{tgt}`, status=reverted")


def cmd_audit(a):
    notes = load_all()
    today = dt.date.today()
    findings = []

    tracked_targets = {n.get("target") for n in notes}

    for n in notes:
        nid, st, tgt = n.get("id", "?"), n.get("status"), n.get("target", "")
        where = exists(tgt)

        if st == "experimental":
            if where == "integrated":
                findings.append((nid, "GRADUATED", f"target moved to integrated -> `set {nid} permanent`"))
            elif where == "missing":
                findings.append((nid, "GONE", f"target removed -> `set {nid} reverted`"))
            else:
                rb = n.get("review_by")
                try:
                    overdue = rb and dt.date.fromisoformat(rb) < today
                except ValueError:
                    overdue = False
                if overdue:
                    findings.append((nid, "OVERDUE", f"review_by {rb} passed -> judge: graduate or revert"))
        elif st == "permanent":
            if where == "missing":
                findings.append((nid, "BROKEN", f"permanent target `{tgt}` no longer exists"))
            elif where == "experimental":
                findings.append((nid, "MISLABELED", f"marked permanent but still in experimental/"))
        elif st == "proposed":
            try:
                age = (today - dt.date.fromisoformat(n.get("date", today.isoformat()))).days
            except ValueError:
                age = 0
            if age > 14:
                findings.append((nid, "STALE", f"proposed {age}d ago, never acted on"))

    # untracked experimental rules (the volatile ones that MUST be recorded)
    if os.path.isdir(EXPERIMENTAL):
        for fn in sorted(os.listdir(EXPERIMENTAL)):
            if fn.endswith(".md"):
                rel = os.path.join("docs", "experimental", fn)
                if rel not in tracked_targets:
                    findings.append(("--", "UNTRACKED", f"`{rel}` has no decision note -> `new`"))

    print(f"# Ledger audit — {today.isoformat()}")
    print(f"\nRecords: {len(notes)} | findings: {len(findings)}\n")
    if not findings:
        print("✓ ledger and repo are in sync. Nothing to manage.")
        return
    print("| id | flag | action |")
    print("|----|------|--------|")
    for nid, flag, action in findings:
        print(f"| {nid} | {flag} | {action} |")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("new")
    p.add_argument("--title", required=True)
    p.add_argument("--status", default="proposed", choices=STATUSES)
    p.add_argument("--knob", default="")
    p.add_argument("--target", default="")
    p.add_argument("--evidence", default="")
    p.add_argument("--review-by", dest="review_by", default="")
    p.add_argument("--tags", default="")
    p.set_defaults(func=cmd_new)

    p = sub.add_parser("list")
    p.add_argument("--status", choices=STATUSES)
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("audit")
    p.set_defaults(func=cmd_audit)

    p = sub.add_parser("set")
    p.add_argument("id")
    p.add_argument("status")
    p.set_defaults(func=cmd_set)

    p = sub.add_parser("graduate")
    p.add_argument("id")
    p.set_defaults(func=cmd_graduate)

    p = sub.add_parser("revert")
    p.add_argument("id")
    p.set_defaults(func=cmd_revert)

    a = ap.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
