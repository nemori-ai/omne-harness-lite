# 可复核的来源与观察

抓取与检索日期一律 2026-09-22。网络来源写 URL；本机来源写绝对路径与探针词。
每条的「消费对象」指向 [research.md](research.md) 的结论锚点。

## 网络一轮

### 1. opencode 的数据库层

- 消费对象：[TS 同行用内置 node:sqlite](research.md#ts-实现的同行-harness-用内置-nodesqlite不用原生插件)、[sqlite 参数一致](research.md#sqlite-运行参数在三家-tsrust-实现里一致)
- 来源与精确修订：`sst/opencode` 分支 `dev`，2026-09-22 抓取；根 `package.json` catalog `"drizzle-orm": "1.0.0-rc.2"`
- 来源立场：作者源码
- 取得方式：`https://raw.githubusercontent.com/sst/opencode/dev/packages/core/src/database/{sqlite.node.ts,sqlite.bun.ts,database.ts,migration.ts}`、`packages/core/src/session/sql.ts`、`packages/core/drizzle.config.ts`
- 实际观察：`sqlite.node.ts` 引 `"node:sqlite"`（`DatabaseSync`）与 `"drizzle-orm/node-sqlite"`，`enableForeignKeyConstraints: true`；`sqlite.bun.ts` 引 `bun:sqlite` 与 `drizzle-orm/bun-sqlite`；`database.ts` 设 `journal_mode = WAL`、`synchronous = NORMAL`、`busy_timeout = 5000`、`cache_size = -64000`、`foreign_keys = ON`；`migration.ts` 自建 `CREATE TABLE migration (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`；`session/sql.ts` 从 `drizzle-orm/sqlite-core` 定义 `session/message/part/...`，`message.data`、`part.data` 为 JSON 列；`packages/core/package.json` 无 `@libsql/client`、`better-sqlite3`
- 支持范围：opencode 用 Drizzle、`node:sqlite`、消息存 sqlite；不支持「Drizzle 可切 pg」
- 后续核对：Drizzle 1.0 正式版发布时重看驱动入口

### 2. Codex CLI 的状态库与转录

- 消费对象：[五家无查询构建器](research.md#被调研的五家-cli-harness-没有一家用查询构建器)、[JSONL 为通行形态](research.md#jsonl-是会话转录的通行形态多家让-sqlite-只做可重建的派生索引)
- 来源与精确修订：`openai/codex` `main`，2026-09-22 抓取
- 来源立场：作者源码 + 官方 issue
- 取得方式：`https://raw.githubusercontent.com/openai/codex/main/codex-rs/{Cargo.toml,state/src/migrations.rs,state/src/sqlite.rs,rollout/src/recorder.rs}`；`https://github.com/openai/codex/issues/21750`
- 实际观察：`sqlx = { version = "=0.9.0", features = [..., "migrate", "runtime-tokio", "sqlite-bundled", ...] }`，无 rusqlite；六个 `sqlx_macros::migrate!` 目录；文件名常量 `state_5.sqlite`、`thread_history_1.sqlite`、`logs_2.sqlite`、`memories_1.sqlite`、`goals_1.sqlite`、`queue_1.sqlite`；`journal_mode(Wal)`、`busy_timeout(5s)`、`synchronous(Normal)`、读写池 `max_connections(5)`；recorder 注释「Writes canonical session rollout items to JSONL」，路径 `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<conversation_id>.jsonl`；issue #21750 原句「Codex is designed to be able to rebuild thread metadata from JSONL via the rollout backfill path」
- 支持范围：Codex 用 sqlx 而非 ORM，JSONL 是权威

### 3. LangGraph / deepagents 的 checkpointer 后端

- 消费对象：[用 pg/redis 的都是框架](research.md#同行-cli-无一用-redis-或消息队列中间件用-pgredis-的都是框架)
- 来源与精确修订：`langchain-ai/langgraph` `main`：`libs/checkpoint-sqlite/pyproject.toml`（3.1.1，deps `aiosqlite>=0.20`、`sqlite-vec>=0.1.6`）、`libs/checkpoint-postgres/pyproject.toml`（3.1.2，`psycopg>=3.2.0`、`psycopg-pool`、`orjson`）；PyPI `langgraph-checkpoint-redis` 0.5.2（2026-08-20，redis-developer 维护）；`deepagents 0.7.17` pyproject 不含 checkpoint 包
- 来源立场：作者源码与官方文档
- 取得方式：上列 raw URL；`https://docs.langchain.com/oss/python/langgraph/persistence`；`https://docs.langchain.com/oss/python/deepagents/backends`
- 实际观察：persistence 文档原句「Use a persistent checkpointer for production: PostgreSQL with async support or SQLite for local file-based storage for development.」；deepagents backends：`StateBackend`（线程内，随 checkpointer）、`StoreBackend`（跨线程，落 BaseStore）、`FilesystemBackend`、`CompositeBackend`
- 支持范围：框架把 sqlite 定位为开发、pg 为生产

### 4. pi 的会话文件

- 消费对象：[JSONL 为通行形态](research.md#jsonl-是会话转录的通行形态多家让-sqlite-只做可重建的派生索引)
- 来源与精确修订：`badlogic/pi-mono` `main`，`packages/coding-agent/docs/session-format.md`、`docs/settings.md`、`package.json`（`@earendil-works/pi-coding-agent 0.87.0`）
- 来源立场：作者文档
- 实际观察：路径 `~/.pi/agent/sessions/--<path>--/<timestamp>_<session-id>.jsonl`；首行 `{"type":"session","version":3,...}`；「Session entries form a tree structure via id/parentId fields, enabling in-place branching without creating new files」；`package.json` 无任何数据库依赖（有 `proper-lockfile`）
- 支持范围：pi 无数据库

### 5. Claude Code / Agent SDK 的目录

- 消费对象：同上
- 来源与精确修订：`https://code.claude.com/docs/en/claude-directory`、`https://code.claude.com/docs/en/agent-sdk/sessions`（2026-09-22）
- 来源立场：厂商文档
- 实际观察：表格 `projects/<project>/<session>.jsonl`「Full conversation transcript」、`history.jsonl`、`sessions/`「one small file per running session」；无 `.db`/`.sqlite` 条目；SDK 跨主机靠「`SessionStore` adapter」镜像转录
- 支持范围：本地无 sqlite

### 6. Goose

- 消费对象：[sqlite 参数一致](research.md#sqlite-运行参数在三家-tsrust-实现里一致)
- 来源与精确修订：`block/goose` `main`，`crates/goose/Cargo.toml`（`sqlx = "0.9.0"` features `sqlite, migrate`）、`crates/goose/src/session/session_manager.rs`
- 实际观察：常量 `"sessions.db"`，WAL、`busy_timeout 30s`、`foreign_keys(true)`；自维护 `schema_version` 表（v16）而不用 `sqlx::migrate!`；`BEGIN IMMEDIATE` 串行化迁移
- 支持范围：Goose 把消息存 sqlite

### 7. Cline / Roo Code、Aider、Mastra、Vercel AI SDK（一句话）

- 消费对象：[用 pg/redis 的都是框架](research.md#同行-cli-无一用-redis-或消息队列中间件用-pgredis-的都是框架)
- 来源：Cline issue #7742（`globalStorage/.../tasks/<id>/{api_conversation_history.json, ui_messages.json}`）；Aider `https://aider.chat/docs/config/options.html`（`.aider.chat.history.md`、`.aider.input.history`）；Mastra `https://mastra.ai/en/docs/storage/overview`（原句「For production, use a persistent managed database. PostgreSQL is a good default」，适配器 `@mastra/libsql`、`@mastra/pg`、`@mastra/upstash` 等）；AI SDK `https://ai-sdk.dev/docs/ai-sdk-ui/storing-messages`（示例 `.chats` 目录 JSON，「In a real-world application, you would use a database」）
- 支持范围：IDE 扩展与 Aider 纯文件；框架给多后端

### 8. Drizzle 的方言模型

- 消费对象：[Drizzle 分裂、Kysely 不分裂](research.md#drizzle-在类型层按方言分裂kysely-在构造时传方言)
- 来源与精确修订：`https://orm.drizzle.team/docs/drizzle-config-file`、`https://orm.drizzle.team/docs/drizzle-kit-migrate`、`https://orm.drizzle.team/docs/sqlite/connect-node-sqlite`；`https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/drizzle-orm/src/sqlite-core/query-builders/select.ts`（对照 `pg-core` 同名文件）
- 来源立场：作者文档与源码
- 实际观察：`drizzle.config.ts` 的 `dialect` 单值（`postgresql/mysql/sqlite/turso/singlestore/mssql/cockroach`）；`pg-core` select 有 `for(strength: LockStrength, config: LockConfig)`，`sqlite-core` 没有；官方内置 `drizzle-orm/node-sqlite`（1.0 rc 线）
- 支持范围：类型层分裂是结构性的，不是文档措辞

### 9. Kysely 的方言模型与 `node:sqlite` 方言

- 消费对象：同上；[TS 同行用内置 node:sqlite](research.md#ts-实现的同行-harness-用内置-nodesqlite不用原生插件)
- 来源与精确修订：`https://kysely.dev/docs/dialects`；`https://kysely-org.github.io/kysely-apidoc/interfaces/SelectQueryBuilder.html`（`forUpdate()`「on supported databases」）；`https://raw.githubusercontent.com/kysely-org/kysely/master/src/dialect/sqlite/sqlite-adapter.ts`（`supportsTransactionalDdl = false`，migration lock no-op）；npm `kysely` 0.29.6；`https://api.github.com/repos/wolfie/kysely-node-native-sqlite`（3 stars、1 fork、3 commits 全在 2026-02-15，`pushed_at` 2026-02-15，2 个 open 项）；npm `kysely-node-native-sqlite` 1.1.0（peer `kysely >=0.27.0`，engines `node ^22.5.0`）；Kysely 主仓 issue #1292（2024-12 open，内置 node:sqlite 方言）
- 来源立场：作者文档 + GitHub API 客观计数
- 支持范围：Kysely 单类型多方言；社区 node:sqlite 方言成熟度信号弱

### 10. `@deepseek-ai/cordis` 发布信息（顺带）

- 消费对象：[D-025](../../design/record/decisions/cordis-adoption-version/README.md)
- 来源：`https://registry.npmjs.org/@deepseek-ai%2Fcordis`（2026-09-22）：`latest` 4.0.4；4.0.2 发布 2026-08-30，4.0.3 与 4.0.4 均 2026-09-22；依赖 `@deepseek-ai/cosmokit ~1.8.5`、`@standard-schema/spec ^1.1.0`；`vendor/cordis/CHANGELOG.md` 在 DSH 主仓 404
- 支持范围：版本存在性；不支持 4.0.2→4.0.4 的变更内容

## 本机一轮（五家 CLI 的可取证副本，此处直接写绝对路径；副本随本机环境存在，迁出后须重新取得）

取证纪律：带边界特征串（`rusqlite`、`sqlx-sqlite-0.9.0`、`better-sqlite3`、`node:sqlite`、`bun:sqlite`、`drizzle-orm`、`kysely`、`@libsql/`、`ioredis`、`redis://`、`PRAGMA journal_mode`、`_sqlx_migrations`）；状态目录逐文件看魔数 `SQLite format 3`；sqlite 库以 `file:…?mode=ro&immutable=1` 打开。

### 11. Codex 0.154.0（`~/.codex/packages/standalone/current/bin/codex`；状态 `~/.codex/`）

- 消费对象：[五家无查询构建器](research.md#被调研的五家-cli-harness-没有一家用查询构建器)、[JSONL 为通行形态](research.md#jsonl-是会话转录的通行形态多家让-sqlite-只做可重建的派生索引)
- 实际观察：二进制含 `sqlx-core-0.9.0`（32 次）、`sqlx-sqlite-0.9.0`（25 次）、`SELECT 1 FROM _sqlx_migrations WHERE version = ?`、`PRAGMA busy_timeout = `；`rusqlite`、`libsqlite3-sys`、`sea-orm` 0 次；`diesel` 2 次是德语 `dieselben` 子串；`redis` 11 次全是 redistribute/rediscover，`redis://` 0 次。状态目录六个 `.sqlite` 魔数为 `SQLite format 3`，goals/memories/queue/logs 旁有 `-wal`/`-shm`；`threads.rollout_path` 指向 `sessions/2026/09/16/rollout-….jsonl`；`threads.history_mode` 分布 `legacy` 984 / `paginated` 1671；`thread_history_1.sqlite` 的 `thread_items` 301,164 行；`rollout_migration_state` 含 `legacy_to_paginated_v1`；各库 `_sqlx_migrations` 条数 state 54、thread_history 6、logs 2、goals 2、memories 1、queue 1
- 支持范围：Codex 正在从纯 JSONL 转录迁到 sqlite 分页历史但仍双写；本地 `queue_1.sqlite` 是 sqlite 队列

### 12. Claude Code 2.1.280（`$(npm root -g)/@anthropic-ai/claude-code/`；状态 `~/.claude/`）

- 消费对象：同上；[无 redis](research.md#同行-cli-无一用-redis-或消息队列中间件用-pgredis-的都是框架)
- 实际观察：状态目录无任何 sqlite 魔数文件；jsonl 1727 个、json 1532 个。二进制里 `bun:sqlite` 13 次、`node:sqlite` 5 次**全部是 Bun 运行时自身**（`.sqlite` 文件加载器、内置模块名表、Bun 模板提示词「`bun:sqlite` for SQLite. Don't use `better-sqlite3`」）；按应用写法 `require("bun:sqlite")` / `from"bun:sqlite"` 0 次。`claude gateway` 子命令用 Postgres：`postgres_url:ue().regex(/^postgres(ql)?:\/\//)`、`SELECT pg_advisory_lock(6775156)`、`CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ ...)`；`ioredis` 唯一命中是提示词「`Bun.redis` for Redis. Don't use `ioredis`」
- 支持范围：本地纯文件；服务端 Postgres 手写迁移

### 13. Cursor agent 2026.08.04-aaa8809（`~/.local/share/cursor-agent/versions/<ver>/`；状态 `~/.cursor/`）

- 消费对象：[TS 同行用 node:sqlite](research.md#ts-实现的同行-harness-用内置-nodesqlite不用原生插件)、[五家无查询构建器](research.md#被调研的五家-cli-harness-没有一家用查询构建器)
- 实际观察：chunk `4343.index.js` = `cursor-sdk-local-runtime/dist/run-store/sqlite/node-sqlite-driver.js`，`var r=s("node:sqlite") … new r.DatabaseSync(e)`；`3047.index.js` 在 `globalThis.Bun` 下走 `bun-sqlite-driver.js`，否则 node:sqlite，缺失时报「node:sqlite is not available in this runtime. The default local agent store requires Node >= 22.13 ... Configure a JsonlLocalAgentStore instead.」；`6022.index.js` 引 `sqlite3@5.1.7`（打补丁）用于 `ai-code-tracking.db`；`4843.index.js` `new(r("better-sqlite3"))(t); u.pragma("busy_timeout = 0")` 用于 `worker.lock`；`node_modules/better-sqlite3` 版本 12.6.2。480 个 `chats/<hash>/<uuid>/store.db`：`blobs(id TEXT PRIMARY KEY, data BLOB)` + `meta`，`user_version=1`，打开时 `PRAGMA journal_mode = WAL; synchronous = NORMAL; busy_timeout = 5000`；520 个 `projects/<slug>/agent-transcripts/<id>/<id>.jsonl`（注释「Agent transcripts for citation」）。`drizzle-orm`、`kysely`、`knex`、`@libsql/` 0 次；`ioredis` 20 次、`redis://` 3 次全在 `@opentelemetry/instrumentation-ioredis@0.51.0`
- 支持范围：三代驱动并存，新默认是 node:sqlite

### 14. Kimi Code（`~/.kimi-code/bin/kimi`，Node SEA，2026-07-30）

- 消费对象：[JSONL 为通行形态](research.md#jsonl-是会话转录的通行形态多家让-sqlite-只做可重建的派生索引)
- 实际观察：状态目录无 sqlite 魔数文件；`node:sqlite`/`DatabaseSync`/`PRAGMA journal_mode` 的命中全部来自 Node 运行时自身（`nodejs_webstorage`、undici `SqliteCacheStore`）；`knex` 3 次是 V8 符号 `weaknext` 子串；`better-sqlite3`、`bun:sqlite`、`drizzle-orm`、`kysely`、`ioredis`、`redis://` 0 次。自研 `packages/minidb/src/{wal,store,skiplist,trigram,...}.ts`，使用处注释「A rebuildable, in-process derived read-…」，开关 `persistence_minidb_readmodel`；`agents/main/wire.jsonl` 首行 `{"type":"metadata","protocol_version":"1.4",...}`，`FileSystemAgentRecordPersistence`，`proper-lockfile@4.1.2`；wire 迁移 `migrateV1_0ToV1_1 … migrateV1_3ToV1_4`
- 支持范围：JSONL 真相 + 自研派生库

### 15. DeepSeek Harness 0.1.5-rc.2（`/tmp/deepseek-harness`，只读副本）

- 消费对象：[TS 同行用 node:sqlite](research.md#ts-实现的同行-harness-用内置-nodesqlite不用原生插件)、[JSONL 为通行形态](research.md#jsonl-是会话转录的通行形态多家让-sqlite-只做可重建的派生索引)
- 实际观察：所有 `package.json` 对 `better-sqlite3`、`sqlite3`、`libsql`、`drizzle`、`kysely`、`prisma`、`knex`、`ioredis`、`redis`、`bullmq`、`typeorm`、`pg`、`pglite`、`level`、`lmdb` 0 命中；`packages/storage/storage-sqlite/src/schema.ts:9 import { DatabaseSync } from 'node:sqlite'`（包描述「SQLite storage backend (kv facet)」）；`session-query-sqlite/src/schema.ts:52` 按需 `await import('node:sqlite')`，FTS5；默认装配 `packages/bundle/base/cordis.patch.yml`：`storage-json`、`session-query-sqlite: path: ':memory:', openAt: never`；`docs/subsystems/persistence.md:329`「an append-only logical JSONL log per session, stored as checksummed concatenated Zstandard frames by default or raw lines by configuration, with crash-safe atomic materialization, per-batch `fsync` appends, and torn-tail truncation」；`STORAGE_SQLITE_SCHEMA_VERSION = 1`（不符拒绝打开）、`SESSION_QUERY_SQLITE_SCHEMA_VERSION = 8`（不符重置）+ `PRAGMA application_id`；会话格式迁移单独成包 `session-format-v0-to-v1/-v1-to-v2/-v2-to-v3`；`.ts` 源码对 `ioredis|redis://|bullmq|amqp|nats|kafka` 0 命中。两处与外部描述不符：`docs/persistence-schema.json` 不存在（内容在 `docs/persistence-catalog.md`）；NIH 审计笔记说「three SQLite backends」，源码只找到两个真实使用方
- 支持范围：DSH 用 node:sqlite、JSONL 真相、派生索引单库

## 第二部分：身份基础设施的来源（网络一轮 + DSH 本机只读，2026-09-22）

### 16. Copenhagen Book / Auth Book / Lucia（服务端令牌与会话）

- 消费对象：[服务端会话令牌的通行范式](research.md#服务端会话令牌的通行范式是高熵不透明-id--服务端记录--每请求现查撤销是删或写一条记录)
- 来源与精确修订：`https://thecopenhagenbook.com/server-side-tokens`、`/sessions`；`https://auth.pilcrowonpaper.com/sessions`（后继）；`https://lucia-auth.com/`（「Lucia was deprecated in March 2025. This website was updated in July 2026」）；`https://raw.githubusercontent.com/lucia-auth/lucia/refs/heads/main/code/auth_session.ts`；`https://v3.lucia-auth.com/basics/sessions`
- 来源立场：独立（Lucia 作者）
- 实际观察：「Tokens should have at least 112 bits of entropy (120-256 is a good range).」「Tokens must be generated using a cryptographically secure random generator.」「Tokens can be validated by hashing the incoming token before querying.」「Session IDs can be hashed before storage to provide an extra level of security.」「Sessions can be invalidated by deleting it from both server and client storage.」Auth Book：「I recommend using a 32-byte secret and hashing it with SHA-256.」「compare it against the stored hash using a constant-time comparison.」替代实现 `auth_session.ts`：token = `id + "." + secret`，存 `SHA-256(secret)`，过期按距上次核验判。**全书无 JWT/stateless 段落**（探针 `JWT`、`stateless`）
- 支持范围：范式与参数；不支持「为什么不用 JWT」的原句

### 17. Django / Rails 的 DB 会话后端

- 消费对象：同上
- 来源与精确修订：`https://docs.djangoproject.com/en/5.2/topics/http/sessions/`（含 `#using-cookie-based-sessions`）；`https://github.com/rails/activerecord-session_store` 与其 `lib/action_dispatch/session/active_record_store.rb`（master）
- 来源立场：官方
- 实际观察：Django：「Session data is stored in a database table named `django_session`.」`session_key`「The current implementation generates a 32-character string」；「Django does _not_ provide automatic purging of expired sessions.」签名 cookie 后端警告：「cookie-based sessions are not invalidated when a user logs out. Thus if an attacker steals a user's cookie, they can use that cookie to login as that user even if the user logs out.」「it cannot guarantee freshness」。Rails：表存 `session_id`，源码 `session_class.find_by_session_id(sid.private_id)`，仅 `!@secure_session_only` 才回退 `public_id`；CVE-2019-25025 时序攻击
- 支持范围：服务端记录 + 现查是两家框架的默认；无状态签名 cookie 不可随登出失效有官方原句

### 18. OWASP Session Management Cheat Sheet

- 消费对象：同上
- 来源：`https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`（独立/准规范）
- 实际观察：「Session identifiers must have at least `64 bits` of entropy」「The session ID content (or value) must be meaningless」「When a session expires, the web application must take active actions to invalidate the session on both sides, client and server.」「All sessions should implement an idle or inactivity timeout」「an absolute timeout, regardless of session activity.」

### 19. 会话令牌范式的代价（跨来源推断）

- 消费对象：同上（「代价与不适用」）
- 依据：第 16～18 条合并推出；离线核验与可撤销不可兼得这一点由第 17 条 Django 警告反向说明。**推断，非原句**

### 20. Fastify / Hono / Passport / Node AsyncLocalStorage

- 消费对象：[principal 显式传参](research.md#principal-在入口捕获一次后显式传参是三家框架的惯用形态asynclocalstorage-当全局当前用户没有官方定性但有官方边界)
- 来源与精确修订：`https://fastify.dev/docs/latest/Reference/Decorators/`；`https://hono.dev/docs/api/context`；`https://www.passportjs.org/concepts/authentication/middleware/`；`https://nodejs.org/docs/latest-v24.x/api/async_context.html`；独立文章 `https://www.trevorlasn.com/blog/node-async-local-storage`、`https://1xapi.com/blog/node-asynclocalstorage-request-context-2026`
- 来源立场：官方 + 独立
- 实际观察：Fastify「To achieve proper encapsulation across requests configure a new value for each incoming request in the `'onRequest'` hook.」「Using `decorateRequest` will emit an error if used with a reference type... Fastify blocks this.」Hono「The value of `c.set` / `c.get` are retained only within the same request.」Passport「the `req.user` property is set to the authenticated user」。Node：`enterWith`「This transition will continue for the _entire_ synchronous execution.」「In rare situations, the current store is lost in one of the asynchronous operations.」独立：「regular parameter passing is clearer.」「Each worker has its own isolated `AsyncLocalStorage`.」
- 支持范围：惯用形态与 ALS 边界；不支持「ALS 存当前用户是反模式」的官方定性

### 21. 12-factor、Docker secrets、`_FILE` 惯例、dotenv 多行、base64 一行

- 消费对象：[密钥作为部署配置输入的两条路](research.md#密钥作为部署配置输入有两条路环境变量多行-pem-要转义或-base64与文件路径_file-惯例挂载秘密)
- 来源与精确修订：`https://12factor.net/config`；`https://docs.docker.com/engine/swarm/secrets/`；`https://github.com/docker-library/docs/blob/master/postgres/content.md`；`https://github.com/motdotla/dotenv#multiline-values`；`https://base64.dev/articles/base64-ssh-pem`、`https://www.jvt.me/posts/2023/02/11/pem-environment-variable/`
- 实际观察：12-factor「The twelve-factor app stores config in environment variables」；Docker「Docker secrets do not set environment variables directly. This was a conscious decision, because environment variables can unintentionally be leaked between containers」，挂载点「`/run/secrets/<secret_name>`」；postgres 镜像「`_FILE` may be appended to some of the previously listed environment variables, causing the initialization script to load the values for those variables from files」；dotenv「If you need multiline variables, for example private keys, those are now supported (`>= v15.0.0`)」；独立：「When you paste a multi-line key directly, the newlines get stripped, mangled...」

### 22. Node 24 crypto 文档、OpenSSL genpkey/pkey、DSH credentials-local

- 消费对象：同上
- 来源与精确修订：`https://nodejs.org/docs/latest-v24.x/api/crypto.html`（`#cryptogeneratekeypairsynctype-options`、`#cryptocreateprivatekeykey`、`#keyobjectexportoptions`、`#cryptosignalgorithm-data-key-callback`）；`https://docs.openssl.org/1.1.1/man1/genpkey/`、`https://docs.openssl.org/master/man1/openssl-pkey/`；`/tmp/deepseek-harness/packages/credentials/credentials-local/src/index.ts`（行 60–143、683–720）、`packages/credentials/credentials/README.md`
- 实际观察：Node：`format`「Must be `'pem'`, `'der'`, `'jwk'`, `'raw-private'`, or `'raw-seed'`. **Default:** `'pem'`.」示例 `export({ format: 'pem', type: 'pkcs8' })` / `type: 'spki'`；「`algorithm` is required to be `null` or `undefined` for Ed25519」；「For lightweight operations like Ed25519 signing or verification, the import cost is a larger fraction of the total」；`sign` 的 `context` 选项（v24.16.0 起，Ed25519ctx，脚注需 OpenSSL 3.2）。OpenSSL：`openssl genpkey -algorithm ED25519 -out xkey.pem`，「Normally a private key is written using standard format: this is PKCS#8 form」。DSH：秘密放 `<harness home>/.credentials.yaml`，`mode: 0o600, dirMode: 0o700`，权限位不对即拒绝启动（错误文本含「is readable beyond its owner」「run "chmod 600 ..." before starting again」）
- 支持范围：API 形状与两条部署路线；DSH 走文件路线

### 23. jose 6.2.12、paseto 4.0.1、PASETO v4 规范、RFC 8032/4648/8725、DSH browser-auth

- 消费对象：[三条签名凭证路线](research.md#三条签名凭证路线里只有直签把无有效期不作废核绑定作为默认jose-与-paseto-都要显式关掉或补上东西)
- 来源与精确修订：npm `jose@6.2.12`（0 依赖，unpacked 210,660 B；GitHub pushed 2026-09-21，7,802 star）；`https://raw.githubusercontent.com/panva/jose/main/src/lib/jwt_claims_set.ts`；jose docs `SignJWT.md`、`CompactSign.md`、`importPKCS8.md`、`JWTVerifyOptions.md`；npm `paseto@4.0.1`（unpacked 538,775 B；499 star）与其 `README.md`、`ProduceOptions.md`、`ConsumeOptions.md`；`https://github.com/paseto-standard/paseto-spec/blob/master/docs/01-Protocol-Versions/Version4.md`、`02-Implementation-Guide/04-Claims.md`；RFC 8032 §5.1.7/§8.4、RFC 4648 §3.3/§3.5/§5、RFC 8725 §2.8/§3.9/§3.11/§3.12；`https://github.com/advisories/GHSA-q67f-28xg-22rw`（CVE-2026-33895，含对 Node 的对照）；`/tmp/deepseek-harness/packages/client/connection/src/browser-auth.ts`（HEAD c291e7961a51）
- 实际观察：jose `jwt_claims_set.ts`：`exp`/`nbf` 只在存在时校验，`iat` 仅在设 `maxTokenAge` 时必需；`issuer`/`audience`/`subject`/`typ` 各「Requires the claim to be present.」——**默认不校验**；`SignJWT` 的 `set*` 全可选。paseto README：「Generated tokens receive `iat` and `exp` claims by default.」`expiresIn` 默认「3600 when `exp` is absent」，`nonExpiring`「Remove any `exp` claim when true」，`allowNonExpiring`「Accept a claims object without an exp claim. Defaults to false.」v4 规范：「Pack `h`, `m`, `f`, and `i` together using PAE」，Version4.md 无 `exp` 字样。RFC 8032 §8.4「Ed25519 and Ed448 signatures are not malleable due to the verification check that decoded S is smaller than l.」通告：「Node.js `crypto.verify` (OpenSSL-backed) rejects the `S + L` variant」。RFC 4648 §3.3「Implementations MUST reject the encoded data if it contains characters outside the base alphabet」。RFC 8725 §3.12 列不同 `typ`、不同必需声明、**不同密钥**、不同 `aud` 为互斥手段。DSH `browser-auth.ts`：`createHmac('sha256', secret)`，格式 `` `v1.${body}.${encodeBase64Url(signature(secret, body))}` ``，核验 `timingSafeEqual` + canonical 解码（`encodeBase64Url(decoded) === value`）；探针 `jose`、`paseto`、`crypto.sign`、`generateKeyPair`、`createPrivateKey`、`Ed25519`、`JWT` 在 DSH 均 0 命中
- 支持范围：三条路线的默认行为与要自己定的事；不支持「哪条更好」

### 24. 本机 Node 24.18.0 捆绑的 OpenSSL

- 消费对象：同上「代价与不适用」
- 取得方式：`node -p process.versions.openssl` → `3.5.7`（2026-09-22，本机）
- 支持范围：本机满足 Ed25519ctx `context` 选项的 OpenSSL ≥ 3.2 前提；不代表所有部署环境
