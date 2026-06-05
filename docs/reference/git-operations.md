# Git Operations

**State-mutating git commands require explicit user permission.**

The user — not the agent — owns the decision to mutate shared history or working state. The agent may *prepare* changes freely, but must stop and ask before applying any of the operations below.

## Always require explicit permission

Before running any of these, ask and wait for an unambiguous go-ahead (e.g. the user says "commit", "push", "merge", "force push", "rebase onto main", etc.):

- `git commit` (including `--amend`)
- `git push` (including `--force`, `--force-with-lease`, deleting remote refs)
- `git merge`, `git rebase`, `git cherry-pick`, `git revert`
- `git reset --hard`, `git reset` that drops staged work the user prepared, `git restore` that discards uncommitted changes
- `git branch -d` / `-D`, `git tag -d`, any remote branch/tag deletion
- `git stash drop` / `git stash clear`
- `git clean` with `-f` / `-d` / `-x`
- `git checkout <ref>` when it would discard uncommitted changes
- `git config` writes to user/global scope
- Any `gh pr merge`, `gh pr close`, `gh release create/delete`, or similar remote-mutating CLI

## Safe without asking

These are read-only or local-scratch and don't need a prompt:

- `git status`, `git diff`, `git log`, `git show`, `git blame`, `git ls-files`
- `git fetch` (no merge), `git remote -v`
- `git branch` (list / create local branch), `git checkout -b <new>` from a clean state
- `git add` / `git restore --staged` (staging is reversible and doesn't mutate history)
- `git stash push` (preserves work; only `drop`/`clear` need permission)
- `gh pr view`, `gh pr list`, `gh issue view`, other read-only `gh` calls

## Interpreting user intent

- **"Make a PR"** authorizes branch creation, staging, and `gh pr create` — but **not** `git commit` or `git push`. Ask before those.
- **"Commit this"** authorizes `git commit` only. Ask before `push`.
- **"Push it"** authorizes `git push` only (assuming a commit already exists).
- **"Ship it" / "land it" / "merge it"** is ambiguous — confirm which operations are in scope.
- When in doubt, prefer one extra round-trip over a destructive surprise.

## If permission is unclear

Stop, summarize what you're about to run, and ask. A two-line confirmation is cheaper than an unwanted force-push.
