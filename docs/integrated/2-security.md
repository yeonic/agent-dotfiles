# Security

## Secrets & Credentials

**Never read secrets. Never handle raw credentials.**

- Don't read `.env` or any secrets file, and don't extract or use raw
  credentials or API keys (DB passwords, API tokens) — not even to "check" one.
- Use credential-abstracting tools where provided (e.g. `linq-db-query` for DB
  reads). That abstraction *is* the boundary; don't reach around it.
- For anything needing secrets — DB writes, migrations, external API calls,
  logins — write the command and have the user run it (e.g. `! make db-migrate`,
  `! aws sso login`), or ask for only what's needed.
- Never echo, length-check, or otherwise touch secret values.
