# 2026-09-23 · 租户领域第二程：全部 TS 成员的测试运行（sqlite ＋ pg）

租户领域第二程波次 1～3 合回之后，在 spoke 工作树上把**全部 13 个 TS 成员**的 build／typecheck／test 各跑一遍，
另跑 `pnpm run lint:rules` 与 `pnpm format:check`；再起一个 `postgres:16` 临时容器，把三份带 `OMNE_TEST_PG_URL` 分支的测试文件各在独立空库上跑一遍。
**这是本仓库第一次有实现测试的运行记录入库**；此前各节点 `verification.md` 里「已通过」的行都是终端输出的转述。

同日另有一次形式工件执行：[`2026-09-23-formal-governance-center-entry/`](../2026-09-23-formal-governance-center-entry/README.md)。
**模型检查与实现测试是两类证据，分开陈述**：本 run 的通过不说明任何模型性质，那边的无反例也不说明任何实现。

**通过不提升任何契约或节点的状态**，[接受归 decisions](../README.md#读取与引用纪律)；把这些结果绑进节点的 `bindings.yaml` 归主线。

## 跑了什么

| | |
|---|---|
| 源码 | 分支 `panqiwei/tenancy-leg-2-evidence`，提交 **`c9b5850c3fe0652cd6c5c3649a703a9bb78254d8`**；开跑前 `git status` 干净（`tmp/`、`dist/`、`node_modules/` 为 Git 忽略） |
| 次序 | `pnpm -r --workspace-concurrency=1 exec pwd` 给出的拓扑序，逐成员 build → typecheck → test（[脚本](commands/run-sqlite.sh)）；之后 `lint:rules`、`format:check` |
| test 的命令 | `pnpm --filter <成员> exec vitest run --reporter=verbose --reporter=json --outputFile.json=<json>`——与各成员的 `test` 脚本（`vitest run`）同一个运行器、同一份 `vitest.config.ts`，只加了两个报告器，**不改被选中的用例** |
| sqlite 一侧 | `OMNE_TEST_PG_URL` 显式 unset；2026-09-23 16:11–16:15 UTC |
| pg 一侧 | 临时容器 `omne-pg-w4`（`postgres:16`，PostgreSQL **16.14**），`127.0.0.1:55439`；三个新建空库各跑一个文件（[脚本](commands/run-pg.sh)，[容器与库](pg-environment.txt)）；2026-09-23 16:16–16:17 UTC；跑完 `docker rm -f` |
| 环境 | Node **v24.18.0**（内置 OpenSSL **3.5.7**，`node:sqlite` 的 SQLite **3.53.1**）、pnpm 10.28.1、TypeScript 6.0.3、vitest 4.1.11、Docker 23.0.4；Linux 5.15.0-1084-aws x86_64，8 核，30 GiB（[全文](environment.txt)） |

原始输出全文：每个成员一份 `output/<成员>.log`（build、typecheck、test 三段，各带命令、起止时刻与退出码；例如 [`output/tenancy-host.log`](output/tenancy-host.log)），
[`output/_lint-rules.log`](output/_lint-rules.log)、[`output/_format-check.log`](output/_format-check.log)，
pg 三份在 `output-pg/`。vitest 的 JSON 报告原样在 `json/<成员>.json` 与 `json-pg/`；
由它们逐条抽出的用例清单（侧、成员、文件、状态、describe、it）在 [`cases.tsv`](cases.tsv)。退出码与耗时：[`exit-codes.tsv`](exit-codes.tsv)、[`exit-codes-pg.tsv`](exit-codes-pg.tsv)。

pg 的口令是每次随机生成、只存在临时文件里；命令行在日志里写成 `***`，跑完用 grep 核过日志与 JSON 里都没有它，随后删掉了临时文件。

## 结果

### sqlite 一侧：13 个成员

| 成员 | build | typecheck | test 文件 | 用例 | 通过 | **跳过** | 失败 | 其中类型测试（`*.spec-d.ts`） |
|---|---|---|---|---|---|---|---|---|
| `core/identity-values` | 0 | 0 | 6 | 211 | 211 | 0 | 0 | 4 |
| `core/kernel-basis` | 0 | 0 | 11 | 27 | 27 | 0 | 0 | 0 |
| `core/storage` | 0 | 0 | 3 | 9 | 9 | 0 | 0 | 4 |
| `tools/ts-checks` | 0 | 0 | 5 | 65 | 65 | 0 | 0 | 0 |
| `core/offer-expiry` | 0 | 0 | 5 | 31 | 31 | 0 | 0 | 3 |
| `infra/storage-sql` | 0 | 0 | 7 | 70 | 66 | **4** | 0 | 0 |
| `infra/clock` | 0 | 0 | 3 | 25 | 25 | 0 | 0 | 0 |
| `tenancy/credential-verification` | 0 | 0 | 2 | 14 | 12 | **2** | 0 | 5 |
| `tenancy/account-identity` | 0 | 0 | 5 | 76 | 66 | **10** | 0 | 19 |
| `tenancy/organization-governance` | 0 | 0 | 9 | 103 | 99 | **4** | 0 | 25 |
| `tenancy/account-registration` | 0 | 0 | 6 | 61 | 60 | **1** | 0 | 6 |
| `tenancy/governance-center-entry` | 0 | 0 | 13 | 424 | 422 | **2** | 0 | 4 |
| `apps/tenancy-host` | 0 | 0 | 7 | 102 | 91 | **11** | 0 | 0 |
| **合计** | 13 × 0 | 13 × 0 | 82 | **1218** | **1184** | **34** | **0** | 70 |

build／typecheck 两列是退出码；test 三列的退出码也都是 0。vitest 的类型测试（`typecheck.enabled`）在各成员报告里都是 `Type Errors  no errors`。

| 仓库级检查 | 结果 |
|---|---|
| `pnpm run lint:rules` | 退出 0：`PASS: ts-checks 20 条规则，扫描 …/packages、…/apps，无违反。`（[原文](output/_lint-rules.log)） |
| `pnpm format:check` | 退出 0：`All matched files use Prettier code style!`（[原文](output/_format-check.log)） |

### pg 一侧：三个文件、三个空库

| 文件 | 库 | 用例 | 通过 | 失败 | 原文 |
|---|---|---|---|---|---|
| `infra/storage-sql/tests/conformance.postgres.spec.ts` | `w4a_conformance` | 19 | 19 | 0 | [log](output-pg/storage-sql.conformance.postgres.log) |
| `infra/storage-sql/tests/upgrade.postgres.spec.ts` | `w4a_upgrade` | 3 | 3 | 0 | [log](output-pg/storage-sql.upgrade.postgres.log) |
| `apps/tenancy-host/tests/pg.spec.ts` | `w4a_host_admin`（它在这里为每条用例 `CREATE DATABASE` 一个新库，`afterAll` 里全删） | 11 | 11 | 0 | [log](output-pg/tenancy-host.pg.log) |

仓库里带 `OMNE_TEST_PG_URL` 分支的测试文件恰是这三份（`grep` 全部 `packages/`、`apps/`、`tools/ts-checks/` 的 `.ts` 核过）。

## 跳过清单：sqlite 一侧的 34 条

**跳过不是通过。**下表逐条列出跳过的用例、它自己写的跳过原因、它指向谁，以及**本 run 里有没有别的用例跑了它指向的那件事**。
「本 run 的承担者」一列只说那条用例跑过且通过，**不判断它是否完整承担了被跳过的那一条**——那是节点 owner 与主线的判断。

| # | 成员 · 文件 | 跳过的用例（节选） | 原因 ／ 指向 | 本 run 的承担者 |
|---|---|---|---|---|
| 1 | storage-sql · `conformance.postgres.spec.ts` | `storage conformance · postgres（缺 OMNE_TEST_PG_URL，未运行）` › `skipped`（占位） | sqlite 下缺 pg URL | pg 一侧 `conformance.postgres.spec.ts` 19 条 |
| 2–4 | storage-sql · `upgrade.postgres.spec.ts` | `upgrade.pg-close-once`、`upgrade.pg-single-transaction`、`upgrade.confirm（pg 支）` | sqlite 下缺 pg URL | pg 一侧同名 3 条 |
| 5–15 | tenancy-host · `pg.spec.ts` | 整个文件 11 条（`assembly.pg-wiring`、`assembly.pg-upgrade-atomic`、U-3、I-9 pg 支、I-12 三条、各包留给 pg 的四条） | sqlite 下缺 pg URL | pg 一侧同名 11 条 |
| 16 | credential-verification · `obligations.spec.ts` | SC-CV-1：account-identity 包不访问 `CredentialMaterial` 内部字段 | 归 W2-C（ts-checks） | ts-checks `consumer-rules.spec.ts` › `sc-cv-1`（3 条）；`lint:rules` 在真实源码上 PASS |
| 17 | credential-verification · `obligations.spec.ts` | 换代演练：AI 与 OG 的 fiber 不重跑 | 归 W3-A（tenancy-host） | tenancy-host `lifecycle.spec.ts` › `assembly.credentials-swap-no-rerun（CV 换代演练）` |
| 18 | account-identity · `obligations.spec.ts` | `no-presentation-in-diagnostics` 的 lint 一形 | 归 W2-C | ts-checks `account-identity-rules.spec.ts` › `no-presentation-in-diagnostics`（3 条） |
| 19 | account-identity · `obligations.spec.ts` | R-8 文本规则 | 归 W2-C | ts-checks `account-identity-rules.spec.ts` › `ai-r8-no-credential-in-write`（3 条） |
| 20 | account-identity · `obligations.spec.ts` | S-45 熵审阅的两条文本规则 | 归 W2-C | ts-checks `account-identity-rules.spec.ts` › `no-random-source-inline`（4 条） |
| 21 | account-identity · `obligations.spec.ts` | S-30 接收边界一侧的静态检查 | 归 W2-C 与 W2-B | ts-checks `entry-rules.spec.ts` › `presentation-only-authn`（4 条） |
| 22 | account-identity · `obligations.spec.ts` | 交错 ② 在 pg 上再跑一次 | 归 W3-A（pg 首跑） | pg 一侧 tenancy-host `pg.spec.ts` › `AI「凭据计算挪出写事务之后的交错 ②」pg 支` |
| 23 | account-identity · `plugin.spec.ts` | S-32／S-47 第 2 支的完整进程重启 | 归 W2-A／W3-A | tenancy-host `process.spec.ts` › `AI S-32 的完整进程重启`（只断言 `verify` 得 `login-state-rejected`）；S-47 第 2 支的「重启后同一批出示物 `exchange` 得同一 `LoginStateId`」在 account-registration `integration.spec.ts` › `I-8`，那是**同进程**整装配重启，不是 OS 进程重启 |
| 24 | account-identity · `scenarios.spec.ts` | S-43 第 2 支（真并发） | 归 W2-A | account-registration `interleavings.spec.ts` › `ai#S-43 第 2 支 × ar 同一次演练`（4 条，sqlite）；pg 一侧 tenancy-host `pg.spec.ts` › `交错 I-12`（3 条） |
| 25 | account-identity · `scenarios.spec.ts` | S-46 ① 的快照部分 | 归 W2-A／W3-A | tenancy-host `upgrade.spec.ts` › `AI S-46 ① 的快照部分` |
| 26 | account-identity · `scenarios.spec.ts` | S-35 静态检查的规则形式（identity-values SC-2） | 归 W2-C | **无**：ts-checks 没有这条规则（20 条规则里没有 SC-2）；类型层一半在 `types.spec-d.ts` › `账号行只有一个 AccountId 列` |
| 27 | account-identity · `scenarios.spec.ts` | S-36 静态检查的规则形式 | 归 W2-C | **无**规则形式；类型层在 `types.spec-d.ts` › `S-36 失败集合逐字对契约（九个方法）` |
| 28 | account-registration · `integration.spec.ts` | I-6 撞 `account_login_identifier_unique` 那一支（sqlite 下到不了） | 归 W3-A（pg） | pg 一侧 tenancy-host `pg.spec.ts` › `AR I-6 … 的 pg 变体` |
| 29 | organization-governance · `scenarios.spec.ts` | S-49 解除之后再加入（跨契约） | 本版不做（资产 owner） | **无** |
| 30 | organization-governance · `scenarios.spec.ts` | S-50 切换只影响此后新建的东西（跨契约） | 本版不做（PF-015 会话契约尚无） | **无** |
| 31 | organization-governance · `scenarios.spec.ts` | S-54 ⑥ 幂等（真跑 AI S-38） | 归 W2-A | account-registration `interleavings.spec.ts` › `og#S-54 ⑥⑦（真实 AI S-38），挨着跑` |
| 32 | organization-governance · `scenarios.spec.ts` | S-54 ⑦ 缺陷观测 | 归 W2-A | 同上一条 |
| 33 | governance-center-entry · `center-id.spec.ts` | 读或铸（S-28 ④）› 真并发首启（pg） | 归 W3-A | pg 一侧 tenancy-host `pg.spec.ts` › `入口层「真并发首启（pg）」` |
| 34 | governance-center-entry · `lifecycle.spec.ts` | T-12 `openSignal` › 崩溃落在开闸之前 | 归 W3-A | tenancy-host `process.spec.ts` › `assembly.no-commit-before-open ②：确认之前 SIGKILL` |

用例全名见 [`cases.tsv`](cases.tsv) 中状态为 `skipped` 的 34 行。

## 独立核对两处逐字节

**不引用包内测试的自报**，另写脚本对构建产物与规格文件直接核对。脚本、原始输出与测量自检都在 `byte-checks/`。

### 一、入口层产出的答复字节 vs 传输绑定 `examples.md` §1～§5

入口层包**没有另存一份 T-2 快照**：它的 `tests/bytes.spec.ts` 直接读传输绑定的 `examples.md` 当快照（文件头注释「快照不另抄一份」）。
所以这里核的是「入口层实际产出的字节」与「`examples.md` 写的字节」：

- [`byte-checks/produce.mjs`](byte-checks/produce.mjs)：`import` 入口层包 **`dist/`**（本 run 刚 build 的产物）里的 `entryAnswerBytes`、`publicHealthBytes`、`routeFor(…).toWire` ＋ `routeSuccessBytes`、`fullHealthBody` ＋ `responseBytes`，
  代入 `examples.md` 页首写明的占位值，写出七份答复字节到 `byte-checks/produced/<名>.bin`。
- [`byte-checks/expected.py`](byte-checks/expected.py)：**自己解析** `examples.md`（不复用包内测试的解析器），每一份的转义文本与十六进制各还原成字节，
  核两种写法相同、总字节数、头部／体字节数、页面所写 SHA-256，再与 `produced/` 逐字节比较。输出在 [`byte-checks/expected.out`](byte-checks/expected.out)。

| `examples.md`（`0efcc32c…`）的哪一份 | 字节数 | SHA-256（页面所写 = 两种写法还原 = 入口层产出） | 结果 |
|---|---|---|---|
| §1 `version-mismatch` | 133 | `cb89af19eb9dee5daac89acb4e2093c752948006e1a83b2eef76dc9ee66fcd27` | 相同 |
| §2 公开体检请求（只核页面自洽，不是答复） | 160 | `1bf21973b666f3f054b76be27d98c624ab7b28bb7f0e6eba5ea728d8ff14812a` | 自洽 |
| §2 公开体检答复 | 197 | `a65cd12d84ffd1ef7927690bda37c20fd87f429c4db4115d60c8b6fd9917ba16` | 相同 |
| §3.1 `login-state-rejected` | 137 | `a2957026d3c970025bd8e868e12b6d0e97465136b43762c546e44c735a524793` | 相同 |
| §3.2 `unavailable` | 128 | `64a5b5280d3576c03a796d9cf5092dba09780572db9ba13b09be23b2d26c80c1` | 相同 |
| §3.3 `invalid-input` | 130 | `58e9d580311df16917e862f74dd97301ea41f06caec6315400a0e74fc46165d1` | 相同 |
| §4 路由结果（列出登录状态两项） | 375 | `4f35ee69c9fcfcb427a176b18fcf9bd851fc5cf32ac6cd47708b46b6e5e4f832` | 相同 |
| §5 运维面完整体检 | 554 | `3e2f3380a3e1a3b0205da3fb6e79af945c725234f34d73d797d1b3670f6c6f62` | 相同 |

**边界**：这是函数级的字节，不是连接上的字节。「整份答复在连接上一次写出、TLS 之上的真实组合逐字节相同」由入口层包
`transport.spec.ts` › `V-1：每一份答复在连接上一次写出` 与 `center.spec.ts` › `T-2 线上逐字节相同（真实组合）` 承担，它们在本 run 里通过。
§5 的完整体检里存储探针那一次读是桩（与包内测试同一做法），真实存储上的现探在 `ops.spec.ts`。

### 二、入口契约 Schema：三份副本与 `examples.md` 的样例

| 文件 | SHA-256 |
|---|---|
| `spec/compositions/governance-center-entry/v1/governance-center-entry.schema.json` | `e8ee446e957163fc91b8cebb87a8434ee0c2a464b53a2264349c8ad54b396fb1` |
| `packages/tenancy/governance-center-entry/schema/governance-center-entry.schema.json` | `e8ee446e957163fc91b8cebb87a8434ee0c2a464b53a2264349c8ad54b396fb1` |
| `spec/data/identity-values/v1/identity-values.schema.json`（入口 Schema `$ref` 它） | `1d1f5743c28de3400ecd332072549b6540ca602e553708491caa468267c6a855` |
| `packages/core/identity-values/schema/identity-values.schema.json`（入口层校验器实际加载的那份） | `1d1f5743c28de3400ecd332072549b6540ca602e553708491caa468267c6a855` |
| `spec/data/offer-expiry/v1/offer-expiry.schema.json`（入口 Schema `$ref` 它） | `63a8ccb42ea5f84a8062c9e8a472679c0d7ff11401c43939641587b48e2b0684` |
| `packages/core/offer-expiry/schema/offer-expiry.schema.json`（入口层校验器实际加载的那份） | `63a8ccb42ea5f84a8062c9e8a472679c0d7ff11401c43939641587b48e2b0684` |

三对都用 `cmp` 核过逐字节相同；三个 spec 文件的哈希也与 `registry/frozen.json` 登记的相同。
**入口层包内只有一份入口 Schema 副本**（`schema/`）：`src/routing/schema.ts` 在运行期 `require` 它，不另存第二份；
任务简报说的「包内 Schema 副本与 `schema/` 副本」两份，实际是同一个文件。

样例：[`produce.mjs`](byte-checks/produce.mjs) 用入口层包 `dist/routing/schema.js` 的 **`entryValidator`**（即产品运行期用的 ajv 校验器，加载上表三份包内副本）
把入口契约 [`examples.md`](../../../spec/compositions/governance-center-entry/v1/examples.md)（`e39db7b5…`，= `frozen.json`）每个「校验对象」下的表逐行求值：
**73 个定义、255 行，255 行与第二列（通过／拒绝）一致，0 行不一致**（[原文](byte-checks/produce.out)）。
这与起草者用 Python `jsonschema` 自检的 255 条、0 条不符是**两个不同的校验器得到同一结论**；本 run 这一次用的是产品实际用的那一个。

### 测量自检：这两个脚本会不会红

没有这一步，「全部一致」证不了脚本在看。两次故意改坏（`byte-checks/selfcheck/`）：

- 把入口 `examples.md` 第一张表第一行的「通过」改成「拒绝」（[diff](byte-checks/selfcheck/examples-mutation.diff)）⇒ `produce.mjs` 报 `DISAGREE` 一行、`agree=254 disagree=1`、**退出 1**（[原文](byte-checks/selfcheck/produce-mutated.out)）。
  第一版脚本在这里退出 0——**测量自身的缺陷，在本 run 里被这一步发现并改掉**（加了「有不一致即退出 1」），之后正式那一次才跑。
- 把 `produced/3.2-unavailable.bin` 倒数第二个字节翻一位 ⇒ `expected.py` 报 `FAIL:produced==example`、**退出 1**（[原文](byte-checks/selfcheck/expected-flipped.out)）。

## 回填清单

逐节点 `verification.md`「证据义务」表逐行写出承担它的测试：[`coverage.md`](coverage.md)。

## 异常

**没有失败的用例、没有非零退出。**以下是跑的过程中看到、只记不修的几处，归主线判断：

1. **跳过清单里 pg 之外的 15 条，指向已经有承担者**（上表 #16～#25、#28、#31～#34），但跳过占位还留在各包里，跳过原因仍写「归 W2-C／W2-A／W3-A」。
   它们不影响结果，只是读包内测试的人会以为那件事还没做。是否把占位改成指向承担者的注释，归各包 owner。
2. **`apps/tenancy-host/tests/pg.spec.ts` 的最后一条**「收尾观察：pg 上 storage-sql 的 `close()` 是否拒绝（已报主线的缺陷；本条只记录，不作判据）」
   只断言 `START > 0` 与 `closeFailures` 是数组——**它恒通过，它的「通过」不是任何证据**；这次 `closeFailures` 里有没有东西，输出里看不到（未知）。
   `close()` 只结束一次的正面证据是 pg 一侧 storage-sql `upgrade.pg-close-once`（通过）。
3. **storage-sql `upgrade.postgres.spec.ts` 的 describe 名**写「（缺 `OMNE_TEST_PG_URL` 时未运行）」，在 pg 一侧真跑时也显示这个名字，读 pg 日志时容易误读成没跑；以用例状态 `passed` 为准。
4. **`byte-checks/produce.mjs` 第一版的缺陷**：见上节，已在本 run 内修正并留了前后证据。

## 这次没有覆盖什么

- **只有 sqlite 与 pg 16 两个存储。**pg 只跑了三份带 pg 分支的文件；其余用例都只在 sqlite 上跑过。pg 版本只有 16.14，没有跑「≥ 14」的下限。
- **单机、单次。**没有重复跑以观察偶发失败；真并发用例的交错取决于这次的调度，通过一次不说明每种交错都被走到。
- **不含 `make check` 的其余部分**（`test:format`、Python 侧 `make test`、`agents-check`）。`make docs-check` 与 `make design-check` 在提交前另跑过，不属于本 run 的结果。
- **不含任何真实外部服务**（OpenRouter、真实客户端 `apps/cli`）；`apps/cli` 不存在。
- **测试替身的范围按各测试自己写的为准**：包内测试多数经 `bootAssembly` 与替身钟；真实钟、真实 TLS、真实子进程的组合在 tenancy-host 与入口层的 `center.spec`、`transport.spec`、`process.spec`。

## 与此前的关系

本区此前没有测试 run。各节点 `verification.md` 里 2026-09-22、2026-09-23 的「已通过」都是主线或实施者的终端转述；
主线 2026-09-23 在 HUB `c9b5850` 上跑过 pg（storage-sql conformance 19/19、upgrade.postgres 3/3、tenancy-host pg.spec 11/11），**未入库**。
本 run 对同一提交重跑、得到相同计数，并把原文留在这里。

返回[运行证据](../README.md) · [已发生的事](../../README.md)
