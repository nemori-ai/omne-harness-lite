# DeepSeek Harness 在 Cordis 之上立了哪些集成约定，各自怎么守

- 调查对象与日期：deepseek-ai/deepseek-harness master `639ed015397290b3745d163aafe02ffee4aa3f84`（2026-09-29，`dsh-root` 0.2.0-rc.2）的仓库约定、文档、生成脚本与参考包；2026-10-02 核对。
- 消费者：#53／#46 合并方案的阶段 3（本项目的 Cordis 集成约定，以 DSH 为起点）、阶段 6a 与 7（约定符合性读数）、阶段 8a（Agent 平面作用域试点）。
- 最近核对：2026-10-02 / DSH `639ed015`。
- 当前结论：DSH 在 Cordis 原语之上有一套成文约定——能力接缝三角色、服务定义形态、`inject` 只许字面量、可选依赖走 `ctx.get`、事件 JSDoc 必写 `@mode`、
  登记即 effect、配置不写死、装配是分层的数据、按会话的 preset 与 `dsh-scope`——其中一部分由生成脚本 fail-closed 守住，一部分只写在约定里；
  事件命名没有成文规则、写法不齐；包级没有依赖方向规则，包图遇环不报错。本仓库所装的 `@deepseek-ai/cordis` 4.0.4 就是 DSH vendor 并发布的那份。

## 问题与区分条件

本仓库 D-112 把 Cordis 定为装配契约而不是建模视角，于是需要一份「做出来的东西怎样以 Cordis 插件与服务的方式集成」的约定。
要区分的是：DSH 的哪些约定是 Cordis 本身的语义、哪些是 DSH 在其上加的规矩；每条规矩由什么守（生成脚本、检查、还是只靠约定）；
DSH 自己在哪些地方没守住。会改变判断的观察：某条约定在 `639ed015` 上找不到出处；文档与实现对不上；同一约定在两处文档说法冲突。

## 证据入口

逐条出处写在下表与 [evidence.md](evidence.md)；源码归档与取法见 [E1](evidence.md#e1dsh-源码归档)，「本仓库的 Cordis 就是 DSH 的 fork」见 [E2](evidence.md#e2本仓库所装-cordis-的来历)。
下表的行号一律指 `639ed015` 上的文件；概念名保留 DSH 原文（代码体），本 topic 不给它们起中文名。

## 当前结论

### DSH 在 Cordis 之上的约定共 17 条，其中 3 条是它自己承认或可观察到的缺口

| # | 约定（DSH 用语） | 出处（`639ed015:文件:行`） | 怎么守 |
|---|---|---|---|
| 1 | `seam` = `Service Definition`／`Service Provider`／`Consumer` 三个角色合起来；`Consumer` 只 inject 服务键，从不 import 提供者特有的类型 | `639ed015:.agents/notes/implemented/architecture/2026-06-13-capability-seams.md:15-19`；`639ed015:AGENTS.md:140`；`639ed015:docs/glossary.md:9` | 约定；`docs/capability-seams.md` 由生成脚本出图（见 #14） |
| 2 | 角色通常分包，但不预拆：只有一个可设想的提供者和一个 `Consumer` 时留在一个包里，直到第二个出现 | `639ed015:.agents/notes/implemented/architecture/2026-06-13-capability-seams.md:25` | 约定 |
| 3 | `Service Definition` 是 Cordis `Service`（抽象类或具体的注册表服务），拥有 `ctx.<key>` 与词汇类型，从不是 TS `interface`；以 `declare module '@deepseek-ai/cordis'` 增补 `Context`；同一上下文只能有一个实现，第二个加载即抛错 | `639ed015:.agents/notes/implemented/architecture/2026-06-13-capability-seams.md:17`；`639ed015:packages/shell/shell/src/index.ts:30-40` | 约定；参考包 `packages/shell` |
| 4 | 插件按服务键找服务，不 import 具体实现；以 `inject` 声明依赖，等依赖就绪再启动，而不是手排启动顺序 | `639ed015:docs/cordis-primer.md:10-11` | Cordis 语义加约定 |
| 5 | `inject` 只写成字符串数组字面量（`export const inject = [...]` 或 `static inject = [...]`）；生成配置目录时遇到别的写法记违规 | `639ed015:scripts/gen-config-catalog.ts:629-633` | 生成脚本 fail-closed |
| 6 | 可选服务用 `ctx.get(name)`；`ctx.<name>` 只留给声明过的注入，因为属性代理随拓扑而变、严格的 `ctx.get` 读全局服务表；只要类型增补不要运行时依赖时写 `import type {} from '…'` | `639ed015:packages/AGENTS.md:6`；`639ed015:docs/api-gateway.md:66` | 约定（附事故复盘链接） |
| 7 | 事件名写作 `<scope>/<event>`，事件词汇放在契约包里（`dsh-agent` 声明 `agent/*`） | `639ed015:.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.md:15-20` | 只是通行写法：在 `AGENTS.md`、`packages/AGENTS.md`、`docs/`、`.agents/notes/implemented`、各包 README 与 `scripts/` 里以 event name、naming、past tense、kebab 等词检索，未找到成文的命名规则 |
| 8 | 类型化事件用声明合并；事件 JSDoc 必写 `@mode` 与载荷 `@param`；Cordis 提供 `emit`／`waterfall`／`parallel`／`serial`／`bail` 五种派发，DSH 的事件分类笔记按用途列了前四种，`bail` 不在其中，但各包 `src/` 里仍有 5 处 `ctx.bail(`（`grep -rn "ctx\.bail(" packages/*/*/src`） | `639ed015:AGENTS.md:135`；`639ed015:docs/cordis-primer.md:12`；`639ed015:.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.md:15-18` | 约定；事件矩阵由生成脚本出图（见 #14） |
| 9 | 登记即 effect：每项贡献经 `ctx.effect()`／`ctx.on()`，注册表的 `register()` 返回撤除函数 | `639ed015:AGENTS.md:133` | 约定 |
| 10 | 插件里不写死可调参数，部署相关的选择是校验过的 `Config` 字段（schemastery）；配错在加载时大声失败，不静默跳过缺失的引用 | `639ed015:AGENTS.md:143-144`；`639ed015:scripts/gen-config-catalog.ts:609-611` | 约定；配置目录由生成脚本出（`docs/config-catalog.md`） |
| 11 | 装配是分层的数据：profile 列出 bundle，bundle 是可被上层打补丁的 Cordis 配置行；层序为各 bundle、profile 的 `cordis.patch.yml`、home 级的、`--patch`；补丁按行 id 定位、整行替换或插入新行；`--dump-config` 打印最终的树 | `639ed015:docs/architecture.md:17-27`；`639ed015:docs/architecture.md:36-39`；`639ed015:vendor/README.md:43` | 运行时机制（vendor 的 `applyEntryPatches`） |
| 12 | 一个会话要不同的能力集时，组合一个 agent preset；preset 里的服务行要有 `isolate` 域；preset 用普通 Cordis YAML 定义 Agent 的子插件，会话从多个 preset 里选一个 | `639ed015:docs/architecture.md:147`；`639ed015:packages/preset/agent-preset/README.md:12` | 运行时机制 |
| 13 | `dsh-scope` 给每个 agent 或分组一份隔离的登记集合，生命周期共享；释放一个 scope 就撤掉它拥有的全部登记；按 scope 过滤的事件声明 `this: Scoped<Base>`，路由键的解析表由生成脚本从类型推出，找不到要显式标 `@dshScopeScan unsupported`，有歧义即失败 | `639ed015:packages/core/scope/README.md:12`；`639ed015:docs/glossary.md:13`；`639ed015:scripts/gen-scoped-events.ts:1-14` | 运行时机制加生成脚本；两处文档对继承的说法冲突，见下一条结论 |
| 14 | 服务图（`docs/capability-seams.md`）、事件生产者与消费者矩阵（`docs/event-producer-consumer.md`）由声明生成；每个服务键都必须在 `SERVICE_ROLES` 表里分类，缺了或多了都抛错 | `639ed015:docs/capability-seams.md:1-2`；`639ed015:docs/event-producer-consumer.md:1-4`；`639ed015:scripts/gen-doc-graphs.ts:109`；`639ed015:scripts/gen-doc-graphs.ts:902-913` | 生成脚本 fail-closed |
| 15 | （缺口）包级没有依赖方向规则，环不报错：`verify-module-graph` 只核生成的包图是否过期；包图排序遇环按「环内稳定回边」继续；有方向规则的只有 client 包内部的目录分层；另两项包级检查核的是清单依赖与源码 import 是否一致、可选 npm 依赖不许静态值 import | `639ed015:package.json:191`；`639ed015:scripts/gen-module-graph.ts:171-183`；`639ed015:scripts/package-graph.ts:32-33`；`639ed015:scripts/package-graph.ts:76-81`；`639ed015:scripts/verify-client-domain-graph.ts:1-11`；`639ed015:scripts/verify-package-dependencies.ts:1`；`639ed015:scripts/verify-optional-dependency-imports.ts:1-16` | 方向与环：无；其余为检查脚本 |
| 16 | （缺口）事件名的时态与单复数不齐，同一个文件里就有 `commands/change` 与 `schedule/changed` | `639ed015:packages/api/remotes/src/remote-events.ts:28`；`639ed015:packages/api/remotes/src/remote-events.ts:46` | 无 |
| 17 | （缺口）服务分类表 `SERVICE_ROLES` 的标题、模式、消费者要手工维护，生成脚本只核对键集合是否一致 | `639ed015:scripts/gen-doc-graphs.ts:109-117`；`639ed015:scripts/gen-doc-graphs.ts:902-913` | 键集合 fail-closed，其余靠人 |

N = 17。

- 适用范围：`639ed015` 这一版的 DSH；DSH 发版频繁，约定条文与行号会漂移。
- 代价与不适用：
  - 角色分包增加包、样板与注入接线（DSH 笔记自述，`639ed015:.agents/notes/implemented/architecture/2026-06-13-capability-seams.md:38`）。
  - #5、#14 的守护挂在生成脚本上，只有跑生成脚本时才生效；#1～#4、#6～#10 只靠约定与评审。
  - #11 的分层装配依赖 vendor 的本地修改（补丁语义抽成纯函数、插入行可被后续补丁定位，`639ed015:vendor/README.md:43`），上游 Cordis 不提供。
  - DSH 的会话与 agent 模型、浏览器端与宿主两套编译面、Typert、i18n 元数据等约定与它自己的产品绑在一起，本表没有收。
- 撞上这条事实会怎样：照搬 #7 而不补命名规则，会复制 #16 的不齐；照搬 #14 的生成方式而不建分类表，生成脚本没有 fail-closed 的依据。
- 来源：本表各行出处；[E1](evidence.md#e1dsh-源码归档)。
- 最近核对：2026-10-02 / DSH `639ed015`。

### `dsh-scope` 的两处文档对「子 scope 是否继承」说法相反

`639ed015:packages/core/scope/README.md:12` 写「Child scopes inherit ancestor contributions, with the nearest definition taking precedence」；
`639ed015:docs/glossary.md:13` 写「Two levels, flat: scoped registrations do not inherit down to subagents; subtree behavior is expressed with lineage data, never scope structure」。

- 适用范围：只是两处文档的文字；本 topic 没有读 `dsh-scope` 的实现去判定哪一处对。
- 代价与不适用：拿任一处当 DSH 的语义引用，都可能引错；要判定得读 `packages/core/scope/src` 或写探针。
- 来源：上两处出处。
- 最近核对：2026-10-02 / DSH `639ed015`。

### 本仓库所装的 `@deepseek-ai/cordis` 4.0.4 就是 DSH vendor 并发布的那份

DSH 把 Cordis 源码 vendor 在 `vendor/cordis/`，以 `@deepseek-ai/cordis` 发布，`version` 为 4.0.4（`639ed015:vendor/cordis/package.json:4`），
上游是 cordiverse/cordis `packages/core` 的 4.0.0-rc.7、提交 `56b3d4f7…`（`639ed015:vendor/README.md:17`）；
vendor 目录维护一份「每处偏离上游都要列出」的本地修改日志（`639ed015:vendor/README.md:31`），共 22 条，覆盖整个 vendor 集合，不只 Cordis 核心。
本仓库 `pnpm-workspace.yaml` 把 `@deepseek-ai/cordis` 钉在 4.0.4，安装出的包 `repository` 指向 `deepseek-ai/deepseek-harness` 的 `vendor/cordis` 目录。

- 适用范围：本仓库主线 `a68f1558b` 与 DSH `639ed015`。
- 代价与不适用：Cordis 行为以 DSH fork 为准，与上游 cordiverse 的 4.0.0-rc.7 不完全相同；本项目手册「最小内核模型」核于更早的 DSH `c291e796`（Cordis 4.0.2），两版之间的差异本 topic 没有逐条核对。
- 来源：[E2](evidence.md#e2本仓库所装-cordis-的来历)。
- 最近核对：2026-10-02。

## 未知与下一项证据

| 未知或冲突 | 最小区分调查／实验 | 受影响选择及消费时点 | 所需产物／责任 |
|---|---|---|---|
| `dsh-scope` 子 scope 是否继承祖先登记 | 读 `packages/core/scope/src` 或写一个两级 scope 的探针 | Agent 平面作用域试点（合并方案阶段 8a） | 试点的承载读数 |
| Cordis 4.0.2 → 4.0.4 之间与约定相关的语义差异（服务代理绑定 `this.ctx`、`ctx.get` 的严格读法） | 在 `kernel-basis` 写探针，对 4.0.4 实测 | 集成约定的依据（阶段 3 第一步） | 阶段 3 的 basis 条目与探针 |
## 采用与后续核对

由 #53／#46 合并方案的阶段 3 消费：哪条照搬、哪条改造、哪条不取，写在本项目的集成约定与 D-114 里，不写在这里。
DSH 升版后若要据新版改约定，先按本表的出处逐行重核，再在 changelog 记一条。
