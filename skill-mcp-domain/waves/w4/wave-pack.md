# W4 波包：契约偏离对齐与 Cordis 服务定义

格式沿 W3 波包，按[范式 r3](../operating-model.md) 变通：两条线合一份，没有线父卡、binding、轨道与 gate；交付卡是 [#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)。本页是 W4 的预案，W3 波末（W3-E）完成之后才开波（范式 §2 第 8 条）。负责人 2026-11-06 06:16：W3 完成后直接开 W4、自主推进，开工前先写好本页与两条线的 `spec.md`、`plan.md`。

## 1. 线与当前波

| 项目 | 本次值 |
| --- | --- |
| 仓库、里程碑、reduce | `nemori-ai/omne-harness-lite`；M2「端到端多轮闭合」完结为边界；reduce 与两条线的负责人是本会话 |
| 卡 | #1119 交付修订 1；W1–W3 报告在卡的评论 |
| 当前波 | W4，两条线都 active |
| 父分支与冻结输入 | `PanQiWei/skill-mcp`。F = `60acfc28b640a1535585df1ebccd22bdc87e4d7c`（2026-11-06，W3-E 完成、开波同步与 reduce 共享写（§3.3）之后的父分支头，已推送）。开波同步：2026-11-06 11:17 UTC `integration/mainline` 相对 `706152690` 没有新提交，同步为空 |
| 开波同步 | 开波时把 `origin/integration/mainline` 普通合并进父分支（范式 §3 最后一行） |
| 上下文 | [W4 上下文包](context-pack.md)（只读调研，先例与待定项）；[W4 方案](plan.md)（评估、交付边界、判据改写、停放清单） |

## 2. 本波目标

M2 之后的消费者能按 Cordis 服务键取到两个领域的服务；W3 登记的三条 MCP 契约偏离兑现。不进应用插件树，不接真实提供者（方案 §2.3）。

## 3. 本波交付边界

### 3.1 成果与判据

| 成果 | 判据 | 线 |
| --- | --- | --- |
| W4-1 契约偏离对齐 | 方案 §4.4 W4-1 的四条验收 | MCP |
| W4-2 Skill 的 Cordis | C5 的 Skill 部分 | Skill |
| W4-3 MCP 的 Cordis | C5 的 MCP 部分 | MCP |
| W4-4 写回与接受请求 | C5、C6 有证据；卡上请求 D-01、D-02 | 两条线，reduce 写 |

C5 原文见方案 §3「C5（改写）」。

### 3.2 明确不做

- 方案 §2.4 停放清单的全部项。
- 应用插件树、真实需求端口的提供者、与消费者联调（M2 之后）。
- `Connections` 的服务键（见 §4 决定 2）。

### 3.3 冻结输入与写集

| 闭包 | 写集 | 依赖 |
| --- | --- | --- |
| `w4-mcp-unusable` | `packages/mcp/mcp-contract/`（T 段、S2、S5、R1、R7、答复类型与 `UnusableCause`，符合性条款与违约实现，用例）、`packages/mcp/mcp-host-local/`（`src/` 两种传输，`tests/` 含 `fixtures/` 与 `model/`，`SPEC.md` 与 `verification/` 写到答复形状处）、`packages/mcp/mcp/`（`internal/lost.ts` 的全函数与调用、任务、发现的转 `lost`，用例，偏离表，SPEC，`verification/`；不含 `internal/build.ts`） | 无 |
| `w4-skill-cordis` | 新成员 `packages/skills/skill-cordis-contract/`；`packages/skills/skill-host-local/` 的 `./cordis` 入口、插件、用例与文档 | 无 |
| `w4-mcp-cordis` | 新成员 `packages/mcp/mcp-cordis-contract/`；`packages/mcp/mcp-host-local/` 的 `./cordis` 入口、插件、用例与文档 | `w4-mcp-unusable` 合入之后开（两者都写 `mcp-host-local`） |

reduce 共享写（派发任何闭包之前一次做完，作为一个提交进父分支；F 是这个提交之后的父分支头）：用 `pnpm package:template create` 生成两个新成员并记下 `scan` 读数；两个新成员的依赖段各加自己的契约成员（`mcp-cordis-contract` → `@omne-harness/mcp-contract`，`skill-cordis-contract` → `@omne-harness/skill-contract`；用例要用契约 `./testing` 时同时进 devDependencies）；`skill-host-local`、`mcp-host-local` 的 `package.json` 依赖段（加 `@deepseek-ai/cordis`、对应的 `*-cordis-contract`；`skill-host-local` 把 `skill` 从 devDependencies 移到 dependencies；`mcp-host-local` 把 `mcp` 从 devDependencies 移到 dependencies）；`pnpm install` 一次更新锁文件。草稿中间态的 `scan` 与 preflight 读数失败归 reduce 处置。两个 host-local 的 `exports` 加 `./cordis` 一项由写者在写 `src/cordis.ts` 的同一提交里做（2026-11-06 改：共享写里先加会让父分支带一个指向不存在文件的导出；`exports` 不影响锁文件）。组页与领域页（W4-4）。写者只填成员内容，不改锁文件与依赖段。

### 3.4 停止条件

- `pnpm package:template` 生成的成员 `scan` 不是 pass，且原因在模板。
- 依赖方向规则拒绝 host-local 依赖 `*-cordis-contract` 或 `@deepseek-ai/cordis`。
- W4-1 的新性质在正控上报违例，且原因不在本波改动。

## 4. 开波设计：四件事的决定

依据：IC-1～IC-9（`docs/architecture/cordis-integration-conventions.md`），先例 `execution-environment-cordis-contract` 与它的提供者 `execution-environment-host-local/src/cordis.ts`、`session-cordis` 的端口键表、`model-host-local` 的工厂参数（上下文包 §3、§4）。不照搬 `tool-cordis-contract` 的 Tool 专有部分。

**决定 1：需求端口经服务键交给插件，插件按调用现取，缺席答该端口的 `unknown`。**

- 他域实现的端口各有一个服务键：Skill 两个（`SkillReadCheck`、`SkillResolution`），MCP 四个（`AdoptionView`、`UseEligibility`、`CredentialUse`、`ProcessLanding`）。键与抽象 Service 在对应的 `*-cordis-contract`，接口仍在契约成员（IC-1、IC-3）。
- 插件在构造时造一组薄适配器。每次调用时从插件自己装载时的 `ctx` 取键（`ctx.get`），不取服务方法里调用方的上下文。键缺席时答该端口已有的失败：MCP 四个端口都有 `unknown`，Skill 两个端口答 `Reply` 的 `unknown`。不写 `static inject`。
- 同组内的端口由插件自己构造，不建键：Skill 的 `SkillPackageSource`（`createDirectorySource`），MCP 的 `store`（内存清单库）与 `transports`（`createLocalTransportFactory`）。
- 函数与本地运行时对象经插件工厂参数交入，不进配置：MCP 的 `principalKey`、`checkOutput`、`clock`、`fetch`。可序列化的上界（`maxListingPages`、`maxActions`、`instructionsByteLimit`、`probeTimeoutMs`、`clientInfo`）进插件配置，按 `McpConfig` 必填、不设隐藏默认值。
- 理由：
  - 缺席落到端口已有的失败通道，两组都按默认拒绝处理 `unknown`，不新增机制。
  - 插件的生命周期不随端口提供者换代而重跑。写 `inject` 时，任一端口换代都会使插件重跑，连接表随之关停重建（IC-8）。
  - M2 之前他域端口没有提供者。写 `inject` 时插件停在 `PENDING`，C5 的装配用例只能先装全部替身才看得到服务。现取时，未提供的端口只让依赖它的操作答 `unknown`。
  - 先例 `execution-environment-host-local` 对他域端口用同一写法（上下文包 §3.1）。

**决定 2：`EndpointInspection` 与 `Connections` 都不建键。**

- `EndpointInspection` 是资产类别协议（`BodyContract`）。资产包以登记接入类别，不用服务键；装配一侧把契约根导出的 `mcpEndpointBodyContract()` 登记进资产的类别注册表（资产 SPEC「类别提供方」，上下文包 §6）。
- `Connections` 的 `closeAll` 由插件撤除调用（决定 4）。`release` 没有消费者来源（领域页与组页的消费方表都没有它）。按范围原则停放，重开条件：有消费者要按服务键释放连接。
- 建键的服务：Skill 三个（`PackageInspection`、`SkillCatalog`、`SkillAccess`），MCP 三个（`ActionDiscovery`、`ActionInvoker`、`EndpointStatus`）。

**决定 3：每组一个插件，插件体里逐个 `new` 三个服务子类，共一条 fiber。**

- IC-2 允许两种写法。MCP 的三个服务共用一次 `createMcp` 装配（同一张连接表、在途表、任务表），分 fiber 时一个服务可以先于其余撤除，而其余仍在用共享的表。共 fiber 让三者同生同灭。
- Skill 的三个服务没有共享资源，也用一个插件：撤除没有要等的东西，一条 fiber 最简单，与 MCP 同形。

**决定 4：MCP 插件撤除时在一个撤除函数里 `await closeAll()`。**

- Cordis 的 effect 之间并发释放（basis `effect-disposal-concurrent-not-ordered`），所以次序只写在同一个撤除函数里。撤除函数登记在插件体，内容只有一步：`await connections.closeAll()`。
- `closeAll` 先把表置为已关停（S8），之后到达的调用按 S8 答复。所以服务键的撤回与 `closeAll` 谁先谁后不影响答复，不需要再排次序。
- `closeAll` 以 `AggregateError` 拒绝时，撤除函数把它原样抛出，由 Cordis 写入 `ctx.logger`，卸载照常完成（先例 `RetirementPending` 的做法）。W4-3 的用例直接断言 `dispose()` 在 `closeAll` 结算之后才返回，以及日志收到这个错误（上下文包 §7 第 7 条的探针）。
- Skill 插件不登记撤除函数：没有资源要收口（上下文包 §5.1）。

## 5. 方法与验证

- 每个闭包有闭包规格，`brief-check` 退出 0 才派发（范式 §2 第 3 条）。写者模型按派发策略取。
- 评审按 C-SM-08：最终 head 一个关口，A、E 必派，改文档派 B，新形状或生命周期派 C，D 一次。阻断只认违反已要求需求或已承诺不变式。
- W4-1 改连接生命周期：新性质先进连接表的 TLA+ 模型或探索器，配一个让它变红的变异（方案 §4.4）。
- W4-2、W4-3 加新形状与生命周期：C 必派。
- 每个闭包合入父分支之前：涉及成员的 `build`、`typecheck`、`test`、`test:slow`，加七项轻门禁。波末在父分支头跑一次 `admission`、`acceptance`、`loop:status --strict --base <F>`。

## 附录：闭包

| 闭包 | 线 | 规格 | 计划 |
| --- | --- | --- | --- |
| `w4-mcp-unusable` | MCP | [mcp/spec.md](mcp/spec.md) 第 1 节 | [mcp/plan.md](mcp/plan.md) 切片 01 |
| `w4-mcp-cordis` | MCP | [mcp/spec.md](mcp/spec.md) 第 2 节 | [mcp/plan.md](mcp/plan.md) 切片 02 |
| `w4-skill-cordis` | Skill | [skill/spec.md](skill/spec.md) | [skill/plan.md](skill/plan.md) 切片 01 |

MCP 线切片 03 与 Skill 线切片 02 是 reduce 自己做的写回，不派闭包。
