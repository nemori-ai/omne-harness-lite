# @omne-harness/schedule-tools

[中文](README_ZH.md)

Adapts Schedule commands and queries to Tool authors, trusted recovery environments, and fixed result disclosure. Services are injected; this package does not construct a backend.

The nine actions cover creation, edits, operation recovery, lists, individual schedules, revisions, history, agendas, and previews. The host supplies durable call recovery, trusted context, disclosure policy, fixed result reads, and the cursor key. It must install the returned guard on generic Tool result reads.

See the [public API](docs/public-api.md), [behavior contract](SPEC.md), [architecture](docs/architecture.md), and [Cordis integration](docs/cordis.md). Source exports own type shapes.

Requires Node >=24 and ESM. Run the package build, typecheck, and test:fast scripts. Tests cover real SQL call recovery and protocol-conforming providers; they do not establish full cross-domain production integration.
