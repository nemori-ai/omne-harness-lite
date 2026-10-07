# SQLite mechanism probes

These inputs use private synthetic databases. They do not certify product recovery, durability, PostgreSQL, or a time limit. Run with the checkout Node version. Save stdout and stderr in your worktree `tmp/`.

- `node packages/infra/storage-sql/tests/probes/sqlite-backup.mjs` checks a WAL backup and destination replacement.
- `pinned-backup.mjs` checks a fixed read view while another connection writes.
- `cancel-backup.mjs` checks callback rejection, read-view release, and a later backup.
- `owner-race.mjs` compares finite races on a private lock database. It does not prove fair scheduling.
- `check-blocking.mjs` and `check-worker.mjs` create about 869 MB of synthetic data. Run them only when that measurement is requested. They are outside ordinary checks.

The current maintenance behavior belongs to [SPEC](../../SPEC.md) and the package tests. Probe results do not establish a performance guarantee or prove that every writer has stopped.
