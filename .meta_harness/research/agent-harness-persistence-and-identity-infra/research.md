# 同行 harness 的持久化选型，以及「只改配置切方言」在 TS 里做得到什么

- 调查对象与日期：见 [README](README.md)；2026-09-22 首轮
- 消费者：D-026；四个基础设施 realization 节点；identity-values 节点的签名方案
- 最近核对：2026-09-22 / 首轮
- 当前结论：同行 CLI 里没有查询构建器，也没有 redis；TS 同行用内置 `node:sqlite`；JSONL 是转录的通行形态，多家让 sqlite 只做派生索引；Drizzle 在类型层按方言分裂、Kysely 不分裂但也不替你抹平 `FOR UPDATE` 这类语义差异。身份部分：服务端会话令牌的通行范式是高熵不透明 ID + 服务端记录 + 每请求现查；密钥作部署配置有 env 与文件两条路；三条签名凭证路线里只有直签把「无有效期、核绑定」作默认，jose 默认不核绑定、paseto 默认强制过期。

## 第一部分：持久化

### 问题与区分条件

要核实的是三件事：① 同行把结构化状态与会话转录各放在哪种载体；② 有没有查询层、迁移怎么做、有没有队列中间件；
③ TS 生态里「同一份代码只改配置在 sqlite 与 pg 间切换」的可行边界。
会改变结论的观察：某家 CLI 在生产里用了查询构建器且切过方言；`node:sqlite` 在生产里被否决；Kysely 或 Drizzle 的方言模型变化。

### 证据入口

[evidence.md](evidence.md) 第 1～10 条（网络）与第 11～15 条（本机）。

### 当前结论

#### 被调研的五家 CLI harness 没有一家用查询构建器

Codex（Rust）用 `sqlx 0.9.0` + `sqlx migrate`，六个按领域拆分的 sqlite 文件，文件名带整库代号（`state_5`、`logs_2`）；
Cursor 手写 `CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version`；DeepSeek Harness 原生 SQL + `user_version`（真相库版本不符拒绝打开、派生库不符就重置）；
Claude Code 与 Kimi Code 本地根本没有 sqlite（Claude Code 的 `gateway` 服务端用 Postgres，手写 `_migrations` 表 + `pg_advisory_lock`）。
唯一用 ORM 的是 opencode（Drizzle + 自写迁移器），它不在本机语料里。

- 适用范围：上列版本；「没有」对 Claude/Kimi/Codex 三家是字符串检索的负面结论，探针词见 evidence 第 12～14 条
- 代价与不适用：原生 SQL 意味着每家都自己维护迁移表与版本策略；它们都**不需要**切换方言，这是它们能不用查询层的前提
- 撞上这条事实会怎样：一个要求「只改配置切 pg」的项目若照抄同行的原生 SQL 做法，会在第一次切方言时重写全部 SQL 文本
- 来源：evidence 第 2、4、11～15 条
- 最近核对：2026-09-22

#### TS 实现的同行 harness 用内置 node:sqlite，不用原生插件

DeepSeek Harness 的 `storage-sqlite` 与 `session-query-sqlite` 都 `import { DatabaseSync } from 'node:sqlite'`，其笔记明确否决 better-sqlite3：内置模块决定 Node 版本下限（22.13 起不需要实验 flag）、能直接进单文件可执行程序、原生插件让打包复杂。
Cursor 新 SDK 的本地运行时同样 `new DatabaseSync(path)`，Bun 下切 `bun:sqlite`，没有 `node:sqlite` 时报错并建议改用 `JsonlLocalAgentStore`；它同时还带着旧的 `sqlite3@5.1.7` 与 `better-sqlite3 12.6.2`（后者只用于进程锁文件与旧 Agent Store）。
opencode 的 Node 路径也是 `node:sqlite` + `drizzle-orm/node-sqlite`。

- 适用范围：DSH 0.1.5-rc.2、Cursor 2026.08.04、opencode dev@2026-09-22
- 代价与不适用：`node:sqlite` 要求 Node ≥ 22.13；API 是同步的（`DatabaseSync`），长查询会阻塞事件循环；Kysely 没有官方 `node:sqlite` 方言（主仓 issue #1292 自 2024-12 open），社区包 `kysely-node-native-sqlite` 1.1.0 只有 3 star、全部 3 次提交在 2026-02-15 同一天、之后无维护
- 来源：evidence 第 1、9、13、15 条
- 最近核对：2026-09-22

#### Drizzle 在类型层按方言分裂，Kysely 在构造时传方言

Drizzle 的 schema 与 db 分别来自 `drizzle-orm/sqlite-core` 与 `drizzle-orm/pg-core`，驱动入口各异，`drizzle.config.ts` 一份只能一个 `dialect`，`drizzle-kit generate` 的迁移产物按方言各一套；
`sqlite-core` 的 select builder 没有 `for(strength)`（`pg-core` 有），锁语义在编译期就分叉。
Kysely 是单一 `Kysely<DB>` 类型，方言只在构造时传 `dialect`；迁移是 TS `up/down(db)` 用 `schema` builder，同一份可跑多方言；`forUpdate()` 在 sqlite 下**不会被剥掉**，调用方要自己按方言分支；sqlite adapter `supportsTransactionalDdl = false`。

- 适用范围：Drizzle 1.0.0-rc.2、Kysely 0.29.6
- 代价与不适用：Kysely 的「方言无关」止于查询构建与迁移 API，列类型名、`FOR UPDATE`、`RETURNING`、`ON CONFLICT` 细节仍要调用方兼容；Drizzle 换来的是更强的 schema 类型推导与官方 `node:sqlite` 驱动
- 撞上这条事实会怎样：用 Drizzle 而声称「只改配置切 pg」，切换那天要复制一整套 schema 与迁移；用 Kysely 而不在协议层处理锁语义，sqlite 上 `forUpdate()` 会静默变成普通读
- 来源：evidence 第 8～10 条
- 最近核对：2026-09-22

#### JSONL 是会话转录的通行形态，多家让 sqlite 只做可重建的派生索引

Codex：`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` 是权威，`thread_history_1.sqlite` 是分页索引，官方 issue 明说可从 JSONL backfill；
Claude Code：`~/.claude/projects/<cwd>/<session>.jsonl`，本地无 sqlite；pi：`~/.pi/agent/sessions/**/*.jsonl`，条目以 `id/parentId` 成树；
DeepSeek Harness：每会话一份只追加 JSONL（默认 zstd 帧压缩，每批 fsync、截掉写坏的尾部），FTS 索引放单独的 sqlite 且默认 `:memory:`；
Kimi Code：`wire.jsonl` + `state.json`，自研 minidb 只当可重建读模型。反例：opencode 与 Goose 把消息直接存 sqlite。

- 适用范围：上列版本
- 代价与不适用：JSONL 为权威意味着索引可能落后或损坏，需要 backfill 路径；把消息存 sqlite 则查询方便但单文件库成为热点
- 来源：evidence 第 2、4、5、13～15 条
- 最近核对：2026-09-22

#### 同行 CLI 无一用 redis 或消息队列中间件；用 pg/redis 的都是框架

Codex 有本地 `queue_1.sqlite`（sqlite 队列，非中间件）；Claude Code、Cursor、Kimi、DSH 对 `ioredis`/`redis://` 的命中全部是提示词文本或 OpenTelemetry 插桩。
LangGraph 的 checkpointer 有 sqlite（本地开发）、postgres（生产默认）、redis（第三方维护）三种；Mastra 文档原句「For production, use a persistent managed database. PostgreSQL is a good default」。

- 适用范围：上列版本
- 代价与不适用：这条事实说明「单机 CLI 不需要队列中间件」，不说明多用户据点进程不需要
- 来源：evidence 第 3、6、7、12～15 条
- 最近核对：2026-09-22

#### sqlite 运行参数在三家 TS/Rust 实现里一致

opencode、Codex、Goose 都设 `journal_mode=WAL`、`synchronous=NORMAL`、`busy_timeout`（5s 或 30s）；opencode 与 Goose 显式 `foreign_keys=ON`；Goose 用 `BEGIN IMMEDIATE` 串行化迁移。

- 适用范围：上列版本
- 代价与不适用：WAL 下多进程读写需同一主机且文件系统支持共享内存；`synchronous=NORMAL` 在断电时可能丢最后一段已提交事务（WAL 模式下不破坏一致性）
- 来源：evidence 第 1、2、6 条
- 最近核对：2026-09-22

## 第二部分：身份基础设施

### 问题与区分条件

三件事：① 不透明会话令牌在服务端怎么生成、存、核验、撤销（对应本项目的 `LoginStateId`）；② 非对称密钥怎样作为部署配置输入；
③ 「绑定一个标识与一个用途、无有效期、不作废」的签名凭证有哪些成熟格式，各自默认行为是什么。
会改变结论的观察：某个成熟库能零配置表达「无有效期且核绑定」；Node 的 Ed25519 签名不再由 OpenSSL 做 S<L 检查。

### 证据入口

[evidence.md](evidence.md) 第 16～24 条。

### 当前结论

#### 服务端会话令牌的通行范式是「高熵不透明 ID + 服务端记录 + 每请求现查」，撤销是删或写一条记录

Copenhagen Book／Auth Book（Lucia 作者）：令牌至少 112 位熵、CSPRNG 生成、可先 SHA-256 再存、每次核验现查；Django DB sessions：cookie 只带 32 字符随机 `session_key`，服务端表按键现查、按 `expire_date` 判活、过期行靠 `clearsessions` 清，**不自动清**；Rails `activerecord-session_store`：表里存 cookie 值的派生 `private_id`；OWASP：ID 至少 64 位熵、内容无意义、过期与登出都要服务端主动失效。
反面：Django 对签名 cookie 后端的官方警告——「cookie-based sessions are not invalidated when a user logs out」「cannot guarantee freshness」。

- 适用范围：Copenhagen Book／Auth Book（2026-07 更新）、Django 5.2、Rails activerecord-session_store master、OWASP cheat sheet（2026-09-22 抓取）
- 代价与不适用：每个受保护操作带一次存储读；存储不可达时无法离线核验（这正是无状态令牌想换来的东西，也正是它不可撤销的原因）。哈希存储只防库泄露不防传输泄露，且要求令牌本身高熵、比较常量时间（Rails CVE-2019-25025 是反例）。过期维度（滑动、绝对、idle）各家都有；「撤销即写事实、无 TTL」的对象要另定清理
- 撞上这条事实会怎样：把令牌做成自包含签名（JWT 一类）而不落服务端记录，登出后旧令牌照常通过——静默失守
- 来源：evidence 第 16～19 条
- 最近核对：2026-09-22

#### principal 在入口捕获一次后显式传参是三家框架的惯用形态；AsyncLocalStorage 当全局当前用户没有官方定性但有官方边界

Fastify `decorateRequest` + `onRequest` 钩子逐请求赋值，且**拦下引用类型跨请求共享**；Hono `c.set/c.get`「retained only within the same request」；Passport `req.user`。Node 官方文档对 `AsyncLocalStorage` 的边界：`enterWith` 会泄露到后续同步事件处理器、回调式 API 会丢上下文、`worker_threads` 不传播、长命 EventEmitter 拿到陈旧上下文；独立文章：「regular parameter passing is clearer」「forcing a specific way of managing context onto your users」。

- 适用范围：Fastify／Hono／Passport 当前文档、Node 24 `async_context`
- 代价与不适用：显式传参要改每个签名；ALS 省签名但上述四类场景会丢或串上下文。**没有官方文档把「ALS 存当前用户」定性为反模式**，这是从边界推出的判断
- 来源：evidence 第 20 条
- 最近核对：2026-09-22

#### 密钥作为部署配置输入有两条路：环境变量（多行 PEM 要转义或 base64）与文件路径（`_FILE` 惯例、挂载秘密）

12-factor 把凭据列为 config、放 env；多行 PEM 进 env 要么 dotenv ≥15 的 `\n` 语法（只对 `.env` 文件有效），要么 base64 一行；Docker secrets 明说不走 env（「environment variables can unintentionally be leaked between containers」），挂到 `/run/secrets/<name>`，官方镜像用 `<VAR>_FILE` 指文件。DSH 走文件：`<harness home>/.credentials.yaml`，`0600`，权限位不对即拒绝启动。
Node API 无分歧：`generateKeyPairSync('ed25519')`、`export({ format: 'pem', type: 'pkcs8' | 'spki' })`、`createPrivateKey/createPublicKey` 默认 `'pem'`、`sign(null, data, key)`/`verify(null, ...)`；文档提醒 Ed25519 导入开销占比大，应导入一次复用 `KeyObject`。`openssl genpkey -algorithm ed25519` 产物同为 PKCS#8 PEM。

- 适用范围：12factor.net、Node 24 crypto 文档、Docker 文档、DSH 0.1.5-rc.2
- 代价与不适用：env 路线密钥明文出现在 `/proc/<pid>/environ` 与子进程继承里；文件路线要定路径约定、权限检查与缺失时的启动失败语义。没有来源讨论「首启自生成落盘」与「运维预生成」的取舍
- 来源：evidence 第 21～22 条
- 最近核对：2026-09-22

#### 三条签名凭证路线里，只有直签把「无有效期、不作废、核绑定」作为默认；jose 与 paseto 都要显式关掉或补上东西

`jose` 6.2.12：零依赖、约 210 KB、EdDSA/Ed25519 可用；`SignJWT` 的 `set*` 全可选，`jwtVerify` 只在 `exp/nbf` 存在时才校验——**但默认不校验 `aud/iss/sub/typ`**，purpose 绑定要靠 `requiredClaims`/`typ`/`aud` 自己落，忘了传选项就是只核签名不核绑定（RFC 8725 §2.8/§3.12 的混淆问题）。
`paseto` 4.0.1（v4.public）：格式与算法钉死、PAE 给出域分离；但**包默认签出 `exp = now + 3600` 且核验默认拒绝无 `exp` 的令牌**，「无有效期」要两端都显式打开（`nonExpiring` + `allowNonExpiring`）；约 539 KB，499 star。
Node `crypto.sign/verify` 直签：零依赖；要自己定载荷规范化（签字节、核实方按字节核不重序列化）、base64url 严格解码（RFC 4648 §3.3/3.5：拒绝字母表外字符与非零 pad bit，或以「重编码等于原串」判 canonical）、域分离（purpose 进被签字节 + 按用途分密钥，RFC 8725 §3.12 列「不同密钥」为一种手段）、版本前缀。Ed25519 可塑性由 RFC 8032 §8.4 的 S<L 检查排除，Node/OpenSSL 做该检查（独立通告的对照测试），但这是 OpenSSL 实现而非 Node 文档承诺。DSH 自己的浏览器会话 cookie 就是「自制 `v1.<base64url body>.<base64url sig>` + `timingSafeEqual` + canonical 解码」，只是用 HMAC 而非非对称签名。

- 适用范围：jose 6.2.12、paseto 4.0.1、Node 24、RFC 8032/4648/8725、DSH `browser-auth.ts`（c291e79）
- 代价与不适用：直签把格式正确性的责任全留给自己（四条要自己定）；jose 换来互操作与成熟格式，代价是包体与「默认不核绑定」的方向；paseto 换来钉死格式，代价是包体与「默认强制过期」的方向。「不作废、无有效期」下泄露的凭证永久有效，三条路无差别，唯一止损是换密钥。Node 24.16+ 的 `sign` `context` 选项（Ed25519ctx）需 OpenSSL ≥ 3.2，本机 Node 24.18 的 OpenSSL 版本见 evidence 第 24 条
- 撞上这条事实会怎样：用 paseto 而不开 `nonExpiring`，凭证一小时后核不过、注册链在两步之间超过一小时即 `interrupted`；用 jose 而不传 `requiredClaims`，一份为 B 签的凭证在 A 上通过
- 来源：evidence 第 23～24 条
- 最近核对：2026-09-22

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| Kysely `node:sqlite` 自写 Driver 的正确性（事务边界、`RETURNING`、错误码透传） | `core/storage` 一致性套件在该 Driver 上全绿 | `infra/storage-sql` 节点；第一程 | 主线 |
| pg 方言下同一套一致性套件是否全绿 | 起一个 pg 跑套件 | 第二程或更晚；本程只接线 | 装配 |
| Node 24.18 捆绑的 OpenSSL 是否 ≥ 3.2（决定 Ed25519ctx `context` 选项可用） | `node -p process.versions.openssl` | 直签路线的域分离手段二选一（purpose 进载荷 vs context 选项）；本程用前者不依赖它 | 主线 |

## 采用与后续核对

D-026 已消费第一部分。
四个基础设施节点建立时回填链接。
