# w4-mcp-cordis 追加 3 写者交回原文

交回时刻 2026-11-06T16:45:01.393Z（会话记录），代理 `a92e10e8cc9ee8e55`，head `014bf7af1`。

---

# 闭包 w4-mcp-cordis 追加 3 交回

## 1. 结论

追加 3 的第 1–8 项都做完了，已本地提交，工作树干净。head 是 `014bf7af1`，分支 `PanQiWei/skill-mcp-w4-mcp-cordis`。

- `src/` 没有改动。产品行为没有缺陷，没有触发停止条件。
- 没有推送，没有开 PR，没有跑差分变异、准入、仓库全量测试或 `metrics`。
- `git diff --name-only 45658242e..HEAD` 共 13 个文件，都在追加 3 放宽后的写范围内。有两个范围外的文件我读了但没改，见第 7 节。

## 2. 提交

作者和提交者都是 `PanQiWei <594557445@qq.com>`。trailer 是 `Harness: claude-code` 和 `Agent-Role: developer`，没有 Co-Authored-By。`lint:rules` 核过署名，通过。

| 提交 | 内容 | 项 |
|---|---|---|
| `913c08d9b` | 快层：拒绝表加 `null`、`undefined`、`maxActions` 与 `instructionsByteLimit` 不是数的行；断言 `plugin.name` 是 `mcp` | 1、2 |
| `f166ee6fc` | 快层：`fetch` 替身加凭据用途的用例，不起进程 | 3 |
| `4a9927449` | 慢层：`clock` 参数的用例 | 4 |
| `e19ae42c7` | SPEC「Cordis 插件的验证」：表加四行，「没有覆盖」改写 | 5 |
| `f7128ccad` | H13 和两份 README 收窄到根入口 | 7 |
| `014bf7af1` | 系统清查，逐句收窄或扩写（表在第 6 节） | 8 |

第 6 项（变红验证）没有源码提交，证据在 `tmp/w4-mcp-cordis/mut/r3/`，该目录不入库。

## 3. 第 1–8 项逐条闭合方式

1. **配置类型行。** 快层拒绝表加四行：
   - `null` 与 `undefined`：`configuration must be an object`。
   - `maxActions` 不是数：`maxActions must be a number`。
   - `instructionsByteLimit` 不是数：`instructionsByteLimit must be a number`。
   - 每行有两个用例：`validate` 断言确切的 `issues`；`ctx.plugin` 断言 `ValidationError` 与 `invalid config:\n  - <message>`。
   - 第四列「去掉 Schema 后是否仍失败」我在草稿用例里实测过，没有 Schema 时：`null` 与 `undefined` 抛 `TypeError`（读 `clientInfo`）；两个上界抛 `RangeError`（`createMcp`）。
2. **插件名。** 快层 `is named mcp` 断言 `createMcpPlugin(parts).name` 是 `mcp`。
3. **`fetch` 与 HTTP 凭据用途。** 快层 `opens a Streamable HTTP endpoint through the fetch of the plugin parts, asking the credential for an http-authorization`，不起进程。
   - 端点：`transport: 'streamable-http'`、`auth: 'static'`，`settings.target` 与 `settings.credential` 都有值。
   - `fetch` 替身记录请求，并以 `cause.code` 为 `ECONNREFUSED` 的 `TypeError` 拒绝。
   - 断言三点：
     - `refresh` 答 `{ failure: { kind: 'connection-unavailable' } }`。
     - 凭据替身记录的用途恰为 `[{ kind: 'http-authorization', target }]`。
     - `fetch` 替身收到 `[{ url: target, authorization: 'Bearer s' }]`，落点替身没有被问到。
   - 依据条号：
     - 请求在离开之前失败，按 mcp-contract T8 X01 使 `discover` 答 `not-sent`（`connection-unavailable`）。
     - 按 S5，`refresh` 答 R6 的 `ConnectionFailure` `connection-unavailable`。
     - 凭据端口按 CU 的 `http-authorization` 用途与 `target` 被问到。
   - 区分「`fetch` 真被用上」的是 `requests` 断言，不是 `refresh` 的答复。不传 `fetch` 时全局 `fetch` 对 `mcp.example.test` 也是网络失败（DNS 失败），答复相同。
4. **`clock`。** 慢层 `stamps the published catalog with the time of the clock in the plugin parts`：
   - 工厂参数给固定时刻的 `clock`，`refresh` 之后 `current` 的 `freshness.acquiredAt` 等于它。
   - `assembled` 加了第三个参数，可以传入另一个插件对象。
5. **SPEC 验证一节。**
   - 表加四行：配置类型、插件名、`fetch` 与凭据用途、`clock`。
   - `fetch` 那一行的「反例」栏写明了区分靠替身收到的请求。
   - `clock` 那一行写明差分变异测不到，证据是手工变异。
   - 「没有覆盖」：
     - 原来「凭据适配器的 HTTP 分支、HTTP 旅程未执行」改为只剩 HTTP 旅程未执行，并写明 HTTP 分支只被一次请求前失败的 `refresh` 走过。
     - 加两类存活变异不补测及理由。组合层面等价：适配器缺席分支改成调用 `undefined` 或答空串、`credentialsOf` 两个相同分支、`CONFIG_FIELDS` 的 `true`、`fieldsIssue` 对符号键的单独判断、Schema 的 `vendor`。只在慢层可测：撤除函数、停止范围警告、日志器名。
   - oxfmt 重排了该表，改动仍只在我的这一节（`git diff -U0` 的 hunk 在 268–290 一带）。
6. **变红验证（r3）。** 见第 4 节。
7. **两条阻断。**
   - SPEC H13「本包不写日志」改为：根入口的传输不写日志；`./cordis` 插件只在撤除时写警告，参数是固定消息、端点引用、停止范围，凭据值不进任何日志。H13 的承诺本身没改。
   - 我核对了 `src/cordis.ts:326`：`logger.warn` 的参数恰为固定消息、`closed.ref`、`closed.process`，不含凭据值。
   - `README.md` 与 `README_ZH.md` 的「配置」节改写：
     - 配置收窄到根入口，写明插件的配置是 `McpPluginConfig`（链接 `SPEC.md#cordis-plugin`）。
     - 「不写日志」收窄到根入口的传输，并写明插件的警告。
     - 「调用方负责进程生命周期、句柄」收窄到经根入口使用时；经插件使用时，`createMcp` 经端口取得句柄，撤除时 `closeAll` 释放（MC-10）。
8. **系统清查。** 表见第 6 节。

## 4. 变红验证表（r3）

- 运行器：沿用 `tmp/w4-mcp-cordis/mut/r2/run.mjs`，复制到 `tmp/w4-mcp-cordis/mut/r3/run.mjs`。变异定义在 `gen.mjs` 与 `mutants.json`。
- 失败用例名读自 vitest 的 JSON 报告。每个变异先构建再运行，最后按字节还原。`git status` 干净，`src/cordis.ts` 无 diff，最后一次构建在还原之后。
- 每个变异一份日志在 `mut/r3/logs/<id>.log`，结果在 `result.json`。
- 命令：
  - 快层：`(cd packages/mcp/mcp-host-local && NO_COLOR=1 VITEST_MAX_WORKERS=4 pnpm exec vitest run --mode fast tests/cordis-entry.spec.ts)`
  - 慢层：`(… vitest run --mode slow --typecheck.enabled=false tests/cordis-journey.spec.ts)`

| id | 变异 | 文件 | 退出码 | 变红的用例（前缀「the MCP plugin on a Cordis context, without a process」略） | 日志 sha256 前 12 位 |
|---|---|---|---|---|---|
| BASE-HL-FAST | 未变异（51 条全过） | 快层 | 0 | — | `7f9f556ffc70` |
| BASE-HL-SLOW | 未变异（14 条全过） | 慢层 | 0 | — | `e823b3afacc8` |
| M01 | 插件名改成 `mcp-x` | 快层 | 1 | `is named mcp` | `127237b52113` |
| M02 | 判定普通对象时不拒绝 `null` | 快层 | 1 | `refuses a configuration that is null`；`fails to load with a configuration that is null, with the ValidationError of Cordis` | `6b3767a48ee9` |
| M03 | 不拒绝 `undefined` | 快层 | 1 | `…that is undefined` 两条 | `4d0ff831c323` |
| M04 | `maxActions` 的消息点错字段 | 快层 | 1 | `…whose maxActions is not a number` 两条 | `2c5fbbbf5314` |
| M05 | `instructionsByteLimit` 的消息点错字段 | 快层 | 1 | `…whose instructionsByteLimit is not a number` 两条 | `3ab0d1fe1251` |
| M06 | 插件从不把 `fetch` 交给传输工厂 | 快层 | 1 | `opens a Streamable HTTP endpoint through the fetch of the plugin parts, asking the credential for an http-authorization` | `266d659527e9` |
| M07 | 凭据适配器不转发 `http-authorization` 的 `acquire`，改答 `fail('unknown')` | 快层 | 1 | 同上，`opens a Streamable HTTP endpoint …` | `7f19f71b14ac` |
| M08 | 插件从不把 `clock` 交给 `createMcp` | 慢层 | 1 | `(with a scripted peer process) stamps the published catalog with the time of the clock in the plugin parts` | `cc7c0d46d48c` |

- 每个变异都是 exit 1 且失败名非空。
- M08 在慢层，差分变异测不到，靠这条手工变异。
- 追加 2 的 r2 变红表（81 次运行）仍有效：这两个文件之后只加了用例，`src/` 没改。

## 5. 验收（head `014bf7af1`，日志在 `tmp/w4-mcp-cordis/mut/r3/gate/`，全部在该 head 上运行）

时间取自日志，UTC。

| 命令 | 退出码 | 输出尾部 | sha256 前 12 位 |
|---|---|---|---|
| `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local`（16:40 起） | 0 | `Tasks: 23 successful, 23 total`；`Test Files 10 passed (10)`；`Tests 472 passed \| 1 skipped (473)`；`cordis-entry.spec.ts (51 tests)`；`cordis-journey.spec.ts (14 tests)` | `fb88d51148d8`（`turbo-test.log`） |
| 同一 `--filter` 的 `pnpm turbo run test:slow`（至 16:41:54） | 0 | `Tasks: 12 successful, 12 total`；`Test Files 6 passed (6)`；`Tests 259 passed \| 9 skipped (268)`；`cordis-journey.spec.ts (14 tests)` | `6ce06da4f022` |
| `pnpm run typecheck`（16:43） | 0 | `Tasks: 90 successful, 90 total`；`Cached: 90 cached, 90 total`；`FULL TURBO` | `0cce0c953f49` |
| `pnpm run lint:rules` | 0 | `PASS: product-checks 27 包规则 + 9 仓库路径规则 … 7 份验收的覆盖声明，6238 个提交的署名，无违反。` | `6aec5a6110c8` |
| `pnpm run lint:oxlint` | 0 | `oxlint -c .oxlintrc.json --report-unused-disable-directives tools scripts packages apps`，无输出 | `fc9b5adca5ed` |
| `pnpm run format:check` | 0 | `All matched files use the correct format.` | `31b5549ae2f4` |
| `pnpm run check:docs` | 0 | `PASS: 2825 Markdown files; local links and skill mirrors.` | `9fe491f03f2a` |
| `git diff --name-only 45658242e..HEAD` | — | 13 个文件，都在放宽后的范围内 | — |
| `git ls-files --eol`（改动文件） | — | `w/crlf` 为 0 | — |

- 层的用例数：快层文件 `cordis-entry.spec.ts` 51 条（原 41，加 10 条）。慢层文件 `cordis-journey.spec.ts` 14 条（原 13，加 1 条）。
- 成员的 `test` 脚本不带 `--mode`，所以 `turbo test` 两个文件都跑。这是追加 2 已报告的脚本现状。
- 两个 spec 文件在提交后另跑过 `pnpm exec oxlint` 与 `oxfmt --check`，通过。
- `typecheck` 日志里出现的缓存回放来自另一棵树的 `json-text`，不影响结论。

## 6. 清查表（第 8 项）

新句在文件里原文可查。「都成立」表示不改。所有引用的行号是改前的行号。

### SPEC.md

| 位置 | 原句 | 判定 | 新句 |
|---|---|---|---|
| :3 | 「本页只写下列内容：本包兑现契约的哪些条款、本包自定的事项、与官方 SDK 的复用关系、与协议和契约的偏离，以及验证。」 | 扩写 | 「本页写下列内容：根入口的传输兑现契约的哪些条款、传输自定的事项、与官方 SDK 的复用关系、与协议和契约的偏离、`./cordis` 插件的行为，以及两个入口的验证。」 |
| :46 | 「契约没有写、由本包定下的事项。」 | 收窄加指路 | 「…由根入口的传输定下的事项。插件自定的事项（配置的切分与 Schema 的判据、撤除时的警告）在 Cordis 插件写明。」 |
| :60 | 「每条写本包怎样兑现…」（H1–H14 前的引言） | 收窄 | 「H1–H14 每条写根入口的传输怎样兑现…插件的判据、反例与用例在 Cordis 插件的验证。」 |
| :117（H13） | 「本包不写日志。」 | 收窄（第 7 项） | 「根入口的传输不写日志。`./cordis` 插件只在撤除时写警告，参数是固定的消息、端点引用与停止范围…凭据值不进任何日志。」 |
| :233 | 验证表行首「公开入口、`RangeError`、H3」（该行断言的是根入口的导出集合） | 收窄 | 「根入口、`RangeError`、H3」 |
| :253 | 「插件用例只用脚本化 stdio 对端，见…」 | 扩写 | 「插件用例走脚本化 stdio 对端；Streamable HTTP 端点只在快层用一个记录请求的 `fetch` 替身走过一次在请求离开之前失败的 `refresh`，见…」 |
| :289（第 5 项合并处理） | 「凭据适配器的 HTTP 用途分支、Streamable HTTP 上的插件旅程：未执行。」 | 改写 | 旅程未执行；HTTP 用途分支只被一次请求前失败的 `refresh` 走过；另加两类存活变异的处置 |
| :341 维护 | 只有「契约 T1–T9、R4 或裁定表变化时重核」 | 扩写 | 加两条：S1、S2、S8、R6、AV6、UE5、CU6、PL4 与 MC-5、MC-10 变化时重核 Cordis 插件与验证一节；Cordis 升版时重跑两个用例文件、重核 `docs/cordis.md` 的机制读数 |
| :12、:34、:88（H7）、:130、:155、:174、:226、:20 | 「本包的产品源码不导入任何 `@modelcontextprotocol/*`」、「本包不发 DELETE」、「本包不在发送之前另判端口」、「本包不把错误变成成功」、「它不认识本包的内部」等 | 都成立，不改 | 对 `src/cordis.ts` 逐项核过：没有 SDK 导入，不发 DELETE，不判端口，不把错误变成成功。 |
| :44 的标题「本包自定」、:100–:115 的偏离表 | 各自「本包的做法」列 | 都成立，不改 | 表的主语是传输；插件没有新增偏离（`src/cordis.ts` 无协议行为）。 |
| :210–:227 所有权一节、:299 以后的性质一节 | 主语是 `Session`、线路、`close()` | 不改 | 主语不是整个成员。这些行在切片 01 的改动区（原 167–190、246），本闭包不碰。 |

### README.md 与 README_ZH.md（中文版逐行对应，同步改）

| 位置 | 原句 | 判定 | 新句（英文版为准） |
|---|---|---|---|
| :9 | 「This package realizes the transport port… Its consumer is `@omne-harness/mcp`」 | 收窄 | 「The root entry realizes… The consumer of the root entry is…」 |
| :19 状态行 | 「verified only on a scripted stdio peer; the plugin journey over HTTP is not run」 | 扩写 | 旅程只在脚本化 stdio 对端上验证；HTTP 上只用记录请求的 `fetch` 替身走过一次请求前失败的 `refresh`；HTTP 上的旅程未执行 |
| :42 | 「Dependencies: … Initialization is building the factory; disposal is each transport's `close()`; there is no global state.」 | 收窄加扩写 | 「Dependencies of the root entry…」「For the root entry, initialization is building the factory…」「The package has no global state.」 |
| :44 | 无插件的初始化与释放 | 扩写 | 加「For the plugin, initialization is loading it with `ctx.plugin(…)` and disposal is `fiber.dispose()`」 |
| :63 | 「which contract clauses this package honours…」「The owners of errors, lifecycle and resources are in the SPEC section on ownership.」 | 扩写 | 条款清单加「the behavior of the Cordis plugin」；加「An invalid plugin configuration fails the load: `ValidationError` for shape, `RangeError` for range」；所有权指向分传输与插件两处 |
| :67 设计 | 「One protocol session … and two lines (…).」 | 收窄加扩写 | 「…make up the root entry.」加「The plugin is a layer of assembly over the transport factory」 |
| :71 | 「The only configuration is `LocalTransportOptions`」「writes no log」「The caller owns…」 | 收窄加扩写（第 7 项） | 见第 3 节第 7 项 |
| :77–78 | 层注释只列 public-entry、session、lines 与 conformance、stdio、http | 扩写 | 加 `cordis-entry`（快）、`cordis-journey`（慢） |
| :81 | 「The slow tier spawns child processes and local HTTP servers … checks … none is left」 | 收窄 | 「The slow cases of `conformance`, `stdio`, `http` and `e2e` spawn … HTTP servers…；`cordis-journey` spawns scripted stdio peers, unloads the plugin after each case and checks that no child process is left」 |
| :85 维护 | 无插件的重核条件；「Consumers: `@omne-harness/mcp` … and the group design」 | 扩写 | 加 S1、S2、S8、R6、AV6、UE5、CU6、PL4、MC-5、MC-10 与 Cordis 升版；消费者加「Cordis assemblies that load the plugin (no application assembly does yet)」 |
| :5、:13–18、:20、:89–109 | 用途句、传输与 conformance 的状态行、目录图 | 都成立，不改 | 用途句已含插件；其余行的主语是传输 |

### docs/

| 位置 | 原句 | 判定 | 新句 |
|---|---|---|---|
| `context.md` :7 | 「必要依赖是契约…初始化只是 `createLocalTransportFactory`；释放是每个传输的 `close()`。调用方要准备：」 | 收窄加扩写 | 「经根入口使用时，必要依赖是…经 `./cordis` 插件使用时，另依赖…初始化是 `ctx.plugin(…)`，释放是 `fiber.dispose()`…经根入口使用时，调用方要准备：」 |
| `context.md` :10 | 「本包只在发出 HTTP 请求…时调用句柄…释放句柄归调用方」 | 收窄 | 「传输只在…调用句柄…经根入口使用时，释放句柄归调用方；经插件使用时，句柄由 `createMcp` 经凭据端口取得，撤除时 `closeAll` 释放（MC-10）」 |
| `context.md` :17–21 图 | 只有 mcp 到 host-local 一条 | 扩写 | 加「Cordis 装配 ──ctx.plugin──► ./cordis ──createMcp──► @omne-harness/mcp」 |
| `context.md` :23 | 「具名消费者：`@omne-harness/mcp`…」「资源所有权（进程归落点、句柄归调用方）」 | 扩写 | 加「`./cordis` 入口的消费者是装载插件的 Cordis 装配…目前没有应用装配装载它」；所有权句加「经插件使用时，调用方是 `createMcp`」 |
| `context.md` :9、:13 | 「传输不起进程」「插件撤除时经 `closeAll` 请落点停止进程」 | 都成立，不改 | 追加 2 已写 |
| `architecture.md` :52 | 「本包按 SDK 2.4.0 的行为对照」；无插件的重核条件 | 收窄加扩写 | 「传输按 SDK 2.4.0…」；加插件依据的条款变化或 Cordis 升版时重核 |
| `architecture.md` :65 | 「设计变化时同步」只列传输 | 扩写 | 加「插件的键、配置、适配器或撤除函数改了 → SPEC「Cordis 插件」、`docs/cordis.md` 与两个 cordis 用例文件」 |
| `architecture.md` :36 | 「产品源码不导入契约的 `./testing`，不导入任何 `@modelcontextprotocol/*`」 | 都成立，不改 | 对 `src/cordis.ts` 核过 |
| `public-api.md` :16–21、:23 | 定义索引与内部模块只列传输 | 扩写 | 索引加 `createMcpPlugin`、`McpPluginParts`、`McpPluginConfig` 三行（失败行为引 SPEC）；内部模块句加「`cordis.ts` 里的配置 Schema、四个端口适配器、三个服务子类与撤除函数也不导出」 |
| `cordis.ts` 文档 IC-4 行 | 证据只写 `public-entry.spec.ts` | 收窄证据 | 「根入口的运行导出只有 `createLocalTransportFactory`；根入口不导入 Cordis 由源码核对（`src/index.ts` 只导出…）」。原句让人以为该用例核对了「不导入 Cordis」，它没有。 |
| `docs/cordis.md` IC-9、IC-16 行 | 证据栏没有新用例 | 扩写 | 加 HTTP `fetch` 用例（IC-9、`fetch` 部件）与 `clock` 用例（`clock` 部件） |
| `flows.md` :3 | 「描述本包的关键业务流程与数据流」（只画了传输） | 收窄加扩写 | 「描述根入口的传输的关键业务流程…并在最后一节画 `./cordis` 插件…」；新增「Cordis 插件：装载、一次调用与撤除」图 |
| `object-model.md`、`index.md`、`README.md`（docs） | 主语是对象、专题 | 都成立，不改 | `object-model.md` 已含插件对象；`:54`「线路从不调用 `stop()`」的主语是传输 |

### src/ 与 tests/

| 位置 | 原句 | 判定 | 新句 |
|---|---|---|---|
| `src/README.md` 维护节 | 只列传输的同步条件 | 扩写 | 加「改插件的键、配置、适配器或撤除函数时，同步 SPEC「Cordis 插件」、`docs/cordis.md`、两个 cordis 用例文件」 |
| `src/README.md` :11、`src/index.md` | 「`src/` 没有 `as`、`any` 与非空断言」「产品源码不导入…」 | 都成立，不改 | 用 `grep` 对 `src/cordis.ts` 核过 |
| `tests/README.md` 维护节 | 无插件的重核条件 | 扩写 | 加 S1、S2、S8、R6、AV6、UE5、CU6、PL4、MC-5、MC-10 与 Cordis 版本变化时核对两个 cordis 用例文件 |
| `tests/README.md` 当前缺口 | 只列传输缺口 | 扩写 | 加「插件在 Streamable HTTP 上的旅程、真实的四个端口实现与撤除期限没有测试」 |
| `tests/README.md` :11 | 快层/慢层的边界句 | 都成立，不改 | 追加 2 已按两个文件写 |
| `tests/index.md` cordis-entry、cordis-journey 两行 | 没有新用例 | 扩写 | 加：`null`、`undefined` 与各上界不是数的行；插件名；HTTP `fetch` 用例；`clock` 用例 |

## 7. 未覆盖、越界待转与建议

1. **包根 `index.md` 需要派发者安排修改。** 它不在追加 3 的写范围内，我没有改。它是成员级入口，三处需要更新：
   - :8，SPEC 内容清单只列 H1–H14、复用表、偏离与性质，没有 Cordis 插件。
   - :15，`src/` 的说明没有 `cordis.ts`。
   - :16，tests 的说明「快层（内存线路）…慢层（真实进程、本机端口）」没有写插件的两个用例文件，也没有写 fetch 替身。
   - 建议新句：
     - :8 在 SPEC 清单里加「、[Cordis 插件](SPEC.md#cordis-plugin)与它的验证」。
     - :15 改成「公开入口（根入口与 `./cordis`）、协议会话、两条线路、插件与辅助模块」。
     - :16 加「Cordis 插件的两个用例文件（快层不起进程，慢层起脚本化 stdio 对端）」。
2. **`documentation.json`。** 没有改，`check:docs` 通过，不需要。
3. **SPEC 与切片 01。** 我只改了 :3、:46、:60、:117、:233、:253、:289、:341 与「Cordis 插件的验证」表。
   - :233 是单行改动，原基线对应第 199 行，与切片 01 的第 201 行之间隔一行。
   - 合入时若在这一带冲突，保留我的 `根入口` 一词即可。
4. **覆盖范围。**
   - Streamable HTTP 上的插件旅程（`refresh` 成功并调用）仍未执行。
   - 插件 HTTP 分支只被一次请求前失败的 `refresh` 走过：证明适配器转发了用途与目标，没有证明 HTTP 上握手与调用成功。
   - 真实的四个端口实现与撤除期限挂起、IC-6、警告级别在装配里是否开到 2 级：仍无用例。
   - M08（`clock`）只有手工变异证据，差分变异测不到慢层。
5. **清理候选。** 没有。
6. **自己做的决定与依据。**
   - HTTP 用例选「请求离开之前失败」而不是 5xx。依据 X01 到 S5，`refresh` 的答复由契约单一条款规定。5xx 在 `discover` 上是 D16（`no-answer` 的 `stream-broken`），分支更多，不如 X01 清晰。
   - 为了守住缓存类缺陷，用例里的 `recordingPurposes` 复制了两个重载（先例同慢层 `recordingCredentials`），没有用 `as`。
   - 变红的第 1 项里，我把 `null` 与 `undefined` 两行的「去掉 Schema 是否仍失败」写成「是：`TypeError`」，来自实测，不是推断。

