---
name: harness-design-handbook
description: >
  从产品需求或系统能力声明出发，分析现有能力及其组合的承载范围，从未覆盖责任推导
  能力演化，定义语言无关契约并投影为 Cordis 插件，完成提供者、装配与验证设计。
  用于新能力设计、既有能力演化和架构/spec 设计交接；普通局部实现修复沿已有契约完成。
metadata:
  status: draft
---

# Harness 设计手册

**产品需求 → 现有能力及组合的覆盖分析 → 剩余责任与能力演化 → 契约和动作链 → Cordis 插件投影 → 反向核对。**
本 skill 提供这条路的上下文地图；从当前缺口进入，参考页解决一个判断后回到主线。

## 在现有能力体系上推理

能力维度是一项可独立解释、经契约组合并可独立演化的系统能力；当前已定义的能力及其关系构成能力基。
先判断新需求能否由其中一个或几个能力承载，再分析尚未覆盖的责任：能扩展已有责任就修订相应能力，
形成新的独立责任时才新增维度。能力基随设计演化，不能由一张预设关注点清单给定。

| 分析对象       | 需要留下什么                                        |
| -------------- | --------------------------------------------------- |
| 产品需求       | 有来源的可观察结果、约束与进展前提                  |
| 现有能力与组合 | 精确契约、覆盖依据、交接关系及尚未覆盖的要求        |
| 能力体系的变化 | 沿用、扩展或新增等选择的理由，边界与消费者影响      |
| Cordis 投影    | 各能力的插件提供者、服务/贡献、依赖、资源和装卸责任 |

正交性体现在责任与变化的分离，能力之间通过显式契约组合；它不自动证明任意操作可交换。
新增独立维度要定义独立的插件实现边界；已有能力足够时复用或补齐其提供者及所需消费与组合。
资料未齐、实现未完成和语义上缺少能力分别处理。具体推理见[能力分解](references/decompose.md)。

## 找到当前入口

先确定本次终点：影响分析、候选设计、规格定稿或实施交接。接手已有工作时复用有效结论，只补缺口。
实际要求、能力、接受依据与采用版本从[工作区上下文](references/workspace-context.md)定位；
内部材料缺失时使用本次明确输入并标明缺口，不向承载仓库查找替代权威。

| 当前缺口                                    | 加载参考页                                                                                                                                      | 本段完成后应能回答                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 需求还是一句愿望，或确认范围不明（S1）      | [需求归位](references/intake.md)                                                                                                                | 谁观察什么，来源与未决项是什么？                     |
| 交互正在形成或修正需求，可能值得持续记录     | [需求归位：自主启记访谈](references/intake.md#何时自主启记访谈)                                                                                  | 应接续哪个访谈包，记录哪些可恢复语境？               |
| 不知道现有能力能否承载、是否应新增（S2–S3） | [能力覆盖与演化](references/decompose.md)                                                                                                       | 谁覆盖什么，剩余责任是什么，为什么组合、扩展或新增？ |
| 责任已有，但性质与行为未闭合（S4–S5）       | [契约与完整动作链](references/define.md)                                                                                                        | 谁在何处保护性质，失败后谁接续？                     |
| 需要把能力契约落实为插件设计（S6）          | [提供者与装配投影](references/project.md)，内核事实见本页[最小内核模型](#cordis-最小内核模型)                                                    | 各能力怎样被提供、组合、替换与撤除？                 |
| 需要审阅、规格落地或交接（S7–S8）           | [交付与反向核对](references/handoff.md)                                                                                                         | 哪些可被消费，能力地图怎样演化，还有哪些缺口？       |
| 同一基线的独立评审反复留下实质阻断 finding  | [三轮未收敛时升级结构诊断](references/handoff.md#三轮未收敛时升级结构诊断)                                                                       | 是否应停止局部补丁，怎样从整体设计链找根因？         |
| 不知道成果是否应长期保存、进入哪个 family   | [信息包准入](references/information-packages.md)                                                                                                | 谁持续消费、谁拥有正文、不满足时停在哪里？           |
| 已定位到选择、变更或施工规划问题            | [设计选择](references/design-decisions.md) / [规格演进](references/spec-evolution.md) / [交付规划](references/delivery-planning.md)，选相关一页 | 决定依据、消费者影响或证据依赖是什么？               |
| 某项 Cordis/DSH 行为影响选择                | 先看[最小内核模型](#cordis-最小内核模型)，不够再按[来源核对](references/source-check.md)取证                                                     | 哪个版本的什么证据支持这条主张？                     |
| 只卡在某个术语或专题                        | [按问题查专题](references/topics.md)                                                                                                            | 需要带回哪个判断，何时返回？                         |

新需求从 S1 开始，完整设计走通 S1–S8，无需为每一步新建文件。
需要落盘时先过[信息包准入](references/information-packages.md)，再按[本地模板](references/workspace-context.md#主题信息包与模板)起步。
S2 的初步覆盖在契约、动作链和实现调查中继续检验；发现反例时回到责任与组合，不把分解表当成结论。
只分析影响时做到承载关系和关键缺口明确即可；只换提供者时复用现有语义，展开投影与相关符合性。

## Cordis 最小内核模型

投影之前必须知道内核会兑现什么、不会兑现什么，否则契约会落在错误的边界上。下面是做这类判断的最小事实集，
核对于 `@deepseek-ai/cordis` 4.0.2 源码（行号均指该包 `src/`），辅以 DSH 修订 [`c291e796`][dsh-docs] 的文档；
二者冲突以源码为准。本次实际采用的版本仍从工作区的采用决定读取，与此基线不同就按[来源核对](references/source-check.md)重验。

- **Fiber 是所有权单位，Context 只是解析入口。** `ctx.plugin(plugin, config)` 应用一次插件并返回一条 Fiber
  （`registry.ts:316`）；同一插件可被应用多次，每次一条 fiber（`registry.ts:139-140`）。子 fiber 的 dispose
  注册为父 fiber 的一个 effect（`fiber.ts:265`），父卸载必然带走子。`Fiber.uid` 只是本次 registry 内的实例身份
  （`fiber.ts:185-186`），不能充当持久身份或租户键。
- **加载由依赖声明驱动，重载是常态而非异常。** `inject` 列出必需服务，不齐就停在 `PENDING`；六态为
  `PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING`（`fiber.ts:139-153`）。`Fiber.store` 是必需服务实现的快照
  （`fiber.ts:197-198`），其代际由各提供者 fiber 的 uid 拼成，任一必需服务换了提供者就先卸载再重跑插件体
  （`fiber.ts:611-639`；`ctx.inject(deps, cb)` 同义，`registry.ts:167-176`）。所以插件体必须可重复执行，
  跨重载要保留的事实不能只活在插件体的闭包里。
- **只有 effect 注册的副作用被纳管。** `ctx.effect(fn, label)` 收集 disposer，接受单个、Promise 与（异步）生成器多个
  （`fiber.ts:403-418`）。同一 effect 内逆序释放（`fiber.ts:431`）；fiber 卸载时各 effect 也按逆注册序取出
  （`utils.ts:27-31`），但随即由 `Promise.all` 并发驱动，异常只写日志不上抛（`fiber.ts:675-686`）。
  逆序只约束启动顺序：要"先排空再关后端"这类次序和结算，必须自己在一个 effect 内组合。fiber 已进入
  `UNLOADING` 或已 dispose 时再建 effect 抛 `CordisError('INACTIVE_EFFECT')`（`fiber.ts:351-353`、`fiber.ts:419-422`）。
- **服务身份是「服务名 + isolate 标签」，同标签下唯一。** 实现登记在按 isolate symbol 索引的扁平 store，
  同标签重复 provide 直接抛错（`reflect.ts:289-290`）——没有"子上下文默认遮蔽父服务"这回事，要并存两份实现
  就得 `ctx.isolate(name, label)`，同 label 的两次调用合流（`context.ts:121-125`）。解析沿 fiber 链向上，
  父的 isolate 标签一旦不同就抛错、不再上溯（`reflect.ts:154-166`）；换实现引起的重载与 `internal/service`
  默认也只在同标签内传播（`reflect.ts:314`）。提供者 fiber 不在 `ACTIVE` 时该服务读不到（`reflect.ts:237-241`）。
- **事件是五种派发，不是一条消息总线。** `emit` 同步派发且不等待返回的 Promise（`events.ts:194-196`），
  `parallel` 并发全等，`serial` 顺序逐个 await，`bail` 同步到首个 bail 值，`waterfall` 是 around 中间件、
  外层先跑、不调 `next()` 即短路（`events.ts:183-243`）。派发模式是事件契约的一部分。过滤器取自派发时的
  `thisArg`：不带 thisArg 的 `ctx.emit(name, ...)` **不过滤**，`on(..., { global: true })` 的监听者一律绕过过滤
  （`events.ts:165-175`）；服务的默认过滤器比较 isolate 标签（`service.ts:61-63`）。
- **配置沿上下文向下注入。** `ctx.intercept(name, config)` 只影响其下装载的插件，祖先在先、近者在后合并
  （`context.ts:128-145`、`service.ts:86-102`）；`fiber.update(config)` 先走 `internal/update` waterfall
  （HMR 可否决或替换）再重启该 fiber（`fiber.ts:736-752`）。

| 原语                                          | 它是什么                                                        | 设计时用它回答                 |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `Context`                                     | 解析入口；`extend`/`isolate`/`intercept` 派生子上下文           | 谁看得见什么，配置从哪来       |
| `Fiber`                                       | 一次插件应用的运行实例，持有 config、依赖快照、effect 与清理    | 谁拥有资源，何时对外可用       |
| `inject` / `Fiber.store`                      | 必需服务声明与其实现快照                                        | 依赖缺席或更换时谁被卸载重跑   |
| `ctx.provide` / `Service`                     | 在某个 isolate 标签下登记一份实现                               | 能力对消费者的服务面           |
| `ctx.effect`                                  | 纳管的副作用及其 disposer                                       | 撤除时释放什么、交接什么       |
| `ctx.isolate` / `ctx.intercept`               | 服务可见性作用域 / 向下游注入服务配置                           | 作用域实例与政策下发           |
| `emit` `parallel` `serial` `bail` `waterfall` | 五种派发                                                        | 是否等待、谁决定结果、失败去哪 |

`isolate` 隔离的是服务实例的**可见性**，不是数据本身：一个服务实例内部握着跨租户的数据句柄，隔离多少次都无效，
租户判定仍归数据访问层的身份校验。上游 DSH 在 Cordis 之上另有 `dsh-scope` 等包，它自述不是沙箱也不是权限边界，
其 Known Limitations 属于那个以 agent 为键的上层 scope，不能算到 Cordis 原生 `isolate` 头上。
纯数据或纯计算不必制造 Fiber；插件数量和服务键数量都不表示能力维度。

### 什么时候必须去读官方文档

上面足以支撑边界判断。设计一旦依赖下列精确行为，就停下来核对；方法与记录格式归[来源核对](references/source-check.md)，
历史修订的定位线索与来源清单归 [Cordis 映射](references/architecture/reference/cordis-mapping.md)。

| 设计开始依赖                                                   | 去读采用版本的源码，再对照官方页                     |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| 精确的重载/卸载时机、并发重入、`await()` 与 `restart()` 的结算 | `src/fiber.ts` + [fiber API][fiber-api]              |
| 某个事件的等待、顺序、返回值或过滤语义                         | `src/events.ts` + [events API][events-api]、[Primer 派发表][primer] |
| config 校验、`internal/update`、HMR 或 loader 的取值时机       | `src/registry.ts` + [registry API][registry-api]、[Primer Loader 段][primer] |
| 服务解析、`provide`/`set`/`accessor`/`mixin` 与 isolate 的交互 | `src/reflect.ts`、`src/service.ts` + [service API][service-api]、[context API][context-api] |
| 复用某个 DSH 上层包（scope、agent 等）或判断跨 realm 与装配    | 该包自己的 README + [DSH 架构][dsh-arch]；上游应用策略不是原语契约 |

不在上述情况就不要展开整个上游仓库。核对结论按"主张 → 采用对象/版本 → 原始证据位置 → 适用范围"留下；
上游行为是事实，采用与否仍是本项目的选择。

## 贯穿主线的边界

- 每项性质能追到需求，每次交接有拥有者；候选政策、已接受承诺、实际实现与证据分别陈述。
- 研究可早于完整 spec；未决项只阻止依赖它的定稿或实施，独立分析继续。
- 新增共享代数保证，或依赖可逆、交换性等省略控制时，读取[组合性质](references/architecture/assurance/composability.md)判断证明义务。
- 内核给的是运行时的组合与生命周期；租户授权、状态迁移、可靠投递、事务和外部效应回滚不因采用 Cordis 而获得，契约要求这些时写清由哪个提供者兑现。
- 能力缺席、撤回或替换时，在途工作与保留事实仍有归属；运行时撤除不等于外部效应回滚。
- 提出、评审、接受、发布和实现是不同动作，加载 skill 不增加批准权限。

## Taste

- **先找承载，再长能力。** 新维度来自未覆盖的独立责任，不能只把需求名改成插件名。
- **不变量先于抽象。** 抽象承担契约或隔离真实变化。
- **最小且充分。** 少建概念，把所有权、失败和进展说完整。
- **成熟复用优先。** 用契约核对差距，再决定直接采用、适配、fork 或自建。
- **一个概念一份权威。** 投影保留语义对应，消费者无需了解提供者内部。
- **变化与缺席是正常状态。** 问清谁接手、何时生效、什么仍为真。
- **复杂度要有收益。** 优化有瓶颈证据，不预建想象中的框架。
- **证据限制信心。** 保留前提与覆盖范围；机制判断给出理由，产品取舍按已有授权确定。

<!-- 官方来源固定在 DSH 修订 c291e7961a515f6d7af9304e7fd1d257929aef26。 -->

[dsh-docs]: https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/docs
[primer]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md
[fiber-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/fiber.md
[events-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/events.md
[registry-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/registry.md
[service-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md
[context-api]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/context.md
[dsh-arch]: https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/architecture.md
