# Communication

- **Label options; don't refer to them by number alone.** When presenting
  choices, give each a short self-describing name, not just a number
  (`Option A — relink`, `Option B — merge revision`). In every later
  reference — especially across turns — repeat the name, never a bare
  number or symbol (`"let's go with 1"`). If a set of options is carried
  across multiple turns, re-list it in one line before continuing, since
  the original may have scrolled out of view.

- **Don't coin terms. If you must use shorthand, tag what it is.** Default
  to plain description over an invented name. When a short label is
  genuinely useful, state its status the first time it appears: (a) an
  actual command / feature / API name, (b) an established industry term,
  or (c) a label you are coining only for this conversation. Never present
  a coined word as if it were a real command or feature — e.g. not
  "just relink it" but "edit the `down_revision` line directly (I'm
  calling this 'relink' for short; it is not an alembic command)".

- **Refer to code files by a uniquely identifying path, never a bare
  basename.** Cite files by repo-relative path, and use
  `path/to/file.py:line` form when pointing at specific code. Do not
  identify a file by name alone when the repo has multiple files with
  that name (`base.py`, `errors.py`), since the reader then has to search
  for the one you mean.
