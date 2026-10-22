# 机制语义条目

这里保存内核与上游组件**实际提供什么、实际不提供什么**的读数，以及让这些读数
在上游变动时自己失效的 probe。

失效事件：上游换版本。与需求、契约、实现都无关——需求改了，这里一个字不动。

## 为什么它需要一个家

同一层知识正在被反复重新推导。三次相互独立的需求走查各自从源码重读 Cordis 内核，
12 条机制主张逐条重合，9 条「内核不提供」的负面清单三份完全相同。
重合本身说明这层知识稳定；反复重推说明它没有家。

代价不只是重复劳动。每次重推都可能读错一处，而读错的地方彼此不同，
错误便随各自的设计扩散出去，且没有任何机制让它们对质。

## 条目形状

`basis/<upstream>/<entry-id>.md`，YAML front-matter 存结构化字段，正文存读数与证据。

```yaml
---
id: async-control-not-bail
upstream: cordis
version: 4.0.2
kind: negative
symbols:
  - "events.ts: dispatch 的返回值判定"
  - "Context.prototype.bail"
lines:
  - "events.ts:165-175"
probe: packages/assembly/kernel-basis/tests/async-control-not-bail.spec.ts
checked: 2026-09-16
---
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `id` | 是 | 稳定条目名，kebab-case 主谓宾，见下 |
| `upstream` / `version` | 是 | 读的是哪个上游的哪个采用版本 |
| `kind` | 是 | `positive` 提供什么，`negative` 不提供什么 |
| `symbols` | 是 | 稳定的符号或语义位置，绑定靠它 |
| `lines` | 否 | 行号只作阅读便利；**与 symbols 失配时不判失败**，行号随上游任何编辑漂移 |
| `probe` | 是 | 一个在该语义消失时会失败的测试 |
| `checked` | 是 | 最后一次对着采用版本核对的日期 |

## 命名：否定事实照直写

条目名用 kebab-case 主谓宾，**反直觉的否定事实直接命名**，不要包装成中性描述：
`async-control-not-bail`、`inflight-not-child-of-session`、`isolate-hides-instances-not-data`。

理由是这类条目的价值全在它推翻了什么。写成 `bail-return-value-semantics`，
读者要读完正文才知道自己原来的理解是错的；写成 `async-control-not-bail`，
标题本身就是告警。设计者在落点表里扫一眼就能被拦下。

## 准入

进入前必须能回答：这条机制语义是否会被**多次设计**反复依赖，`symbols` 是什么，
probe 断言什么。

- 只在本次分析用到的上游读数，留在本次分析产物里，不建条目。
- 给不出会失败的 probe 时，条目登记为待核对主张（`probe: null` 并在正文写明缺口），
  **它不能作为设计依据**；不要用「读过源码」代替可执行证据。
- 上游的应用策略、推荐用法、示例风格不进这里。上游约定不自动成为本项目约定；
  本项目当前采用范围和必要理由归实际拥有者；讨论与运行结果归工作树 tmp。

条目是否准入由本页判断。`version` 与 `checked` 取实际核对的对象版本与日期，
不按创建当天填。依据既有结论建立条目时，继承其最近核对的版本与日期。
条目只留复核的最短路径；本次取证过程放工作树 `tmp/`。

## 怎样被消费

提供者设计与装配核对要用的上游机制读数从这里取，不在每次分析里重推；领域读数与承载读数不拿它当论据。
实际接口/提供者的必要理由按条目 `id` 引用，
并记录 `alignment_checked`；当条目的 `checked` 晚于某条绑定的 `alignment_checked`，
该绑定进入待复核——这是上游变动传播到设计的唯一通路。

升级上游采用版本时，先跑全部 probe：失败的条目就是本次真正改变的语义，
其余条目只需更新 `version` 与 `checked`。没有 probe 的条目在升级时给不出任何信号，
这也是它不能作为依据的原因。

## 当前状态

2026-10-22 把 11 条条目的 probe 从归档目录 `packages.0.0.1.legacy/core/kernel-basis/tests/basis/` 迁入工作区成员 `packages/assembly/kernel-basis/tests/`，文件名是 `<条目 id>.spec.ts`。现在 12 条条目的 probe 都在该成员里，随它的测试运行，对 4.0.4 通过。升级上游时运行该成员的测试即可得到全部 probe 的结果。迁移没有改断言。`plugin-throw-fails-fiber` 的 probe 原来用 zod 写 config schema，该成员不依赖 zod，现在用一个规则相同的最小 Standard Schema。

2026-10-21 加一条（RFC-0012 缺口 6）：`late-plugin-load-unload-does-not-rerun-others`。根已 ACTIVE 后装载一个带登记的插件，再撤除它。登记随插件的 fiber 出现和消失，其他插件体不重跑。它的 probe 在 `packages/assembly/kernel-basis/tests/`，随该成员的测试运行，对 4.0.4 通过。

2026-10-02 加三条，都是实现映射区的 Cordis 集成约定依赖的内核行为：`service-subclass-provides-its-key`（抽象 `Service` 子类在抽象类给的键上提供服务）、
`service-method-ctx-is-caller`（经调用方取到的服务，方法里的 `this.ctx` 是调用方，登记归调用方 fiber）、`ctx-property-is-not-ctx-get`（插件里 `ctx.<键>` 要先声明，`ctx.get` 直接读服务表）；probe 现在在 `packages/assembly/kernel-basis/tests/`。

2026-09-23 阶段 2 加两条（W1-B 实现 account-identity 时核实）：`emit-listener-throw-propagates`（否定事实：`emit` 不隔离监听者）、`logger-level-order-error-lowest`（级别序与缺省阈值）；probe 现在在 `packages/assembly/kernel-basis/tests/`。

已有 6 条条目，均来自账号与租户设计实际依赖的机制语义：
`isolate-hides-instances-not-data`、`async-control-not-bail`、
`plugin-body-reruns-on-provider-change`、`effect-disposal-concurrent-not-ordered`（2026-09-22），
以及 `inject-has-no-optional-form`（含「`ctx.get` 看得见整棵树」）、`plugin-throw-fails-fiber`（2026-09-23 升格，
治理中心入口层的机制读数依赖它们：门只在必需服务全部 `ACTIVE` 时才开、配置错误即启动失败、「没有门」不能靠内核）。

六条的 `probe` 现在在 `packages/assembly/kernel-basis/tests/`，对采用版本 4.0.4 通过（采用版本见 D-025）；
`async-control-not-bail` 的读数在取证时按 4.0.4 源码改正过（Promise 被当作 bail 值，而非被忽略）。
`packages.0.0.1.legacy/core/kernel-basis/tests/basis/` 是归档目录，不是工作区成员，`vitest.tiers.mts` 的归档排除规则使任何成员测试都不运行它。
那里留着两条**不对应 basis 条目**的 probe（`provide-is-effect-managed`、`fiber-state-readable`），
核对的是 realization 节点依赖的共用主张；它们不随成员运行，原来导入的 `support.ts` 已随迁移移走，升格时一并迁入成员并改导入。要不要升格为条目，按本页准入另议。手册正文与历次走查中的其余机制主张尚未迁入。

返回[设计链入口](../README.md)。
