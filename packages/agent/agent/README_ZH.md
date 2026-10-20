PACKAGE_TEMPLATE_DRAFT

# agent

## 职责与状态

不含 Cordis 的通用实现机制、配置与依赖聚合。设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。根入口导出工厂的公开类型与 `createAgentRuntime`。工厂校验配置、绑定、登记句柄、必需依赖与共同提交，成功时返回 idle 的 provider。四个面的公开操作都先核对租户、再调用一次 `access.check`；`observe` 之外的操作本体尚未实现，放行后返回具名的 `unavailable`。`./testing` 入口给测试装配：内存 Journal、各端口的可编排替身、可控时钟与 `createTestAgentDependencies`。

### 支持范围

档位的定义见[成员文档要求](../../../docs/member-documentation.md)，写法沿 [tool 的支持范围](../../tool/tool/README_ZH.md#支持范围)。验证范围只说明测试核对了什么，不说明测试范围之外的行为已成立。

| 档 | 本包的状态 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | 已导出：`AgentRuntimeBinding`、`AgentConfiguration`、`AgentRuntimeOptions`、`AgentDependencies`（17 项依赖）与 `AgentProvider`，形状见[入口设计](docs/public-api.md) | 根入口 | `tests/public-entry.spec.ts` 核对根导出名与 `./testing` 导出名、源码与产物的导入图、清单依赖与 Cordis 路径 |
| 纯契约函数已实现 | 本包没有。契约函数在 `agent-contract` | 无 | 无 |
| 独立执行已实现 | 无 | 无 | 无 |
| runtime 已实现的路径 | `createAgentRuntime` 的创建校验：配置七项越界或绑定字段非法返回 `invalid`（`field` 写配置项路径），登记句柄的 instance 与绑定不一致返回 `denied`，十项必需依赖缺席返回 `unavailable`（`diagnostic` 指名缺席的依赖），`jointCommits` 有一种未被 Journal 声明返回 `unsupported`。失败时不创建 runtime，不调用任何依赖的方法。成功得到 idle 的 provider。访问守卫：四个面的每个公开操作先核对 Access 的租户（缺租户 `invalid`，跨租户 `denied`，两者都不调用 `access.check`），再调用一次 `access.check`，不缓存 allowed，`denied` 与 `unavailable` 不放行。`observe` 放行后给出 idle 状态，signal 中止时以 `closed` 结束。其他操作放行后返回 `unavailable`，`diagnostic` 写「<操作> is not implemented until #502 stage N」：这是阶段性临时做法，不是契约结果 | 根入口 | `tests/factory.spec.ts` 逐项核对四种创建失败与成功的 idle。`tests/provider-access.spec.ts` 对每个公开操作核对租户核对、`access.check` 三态与恰一次。`tests/assembly.spec.ts` 用测试装配得到 idle 的 provider，核对创建没有调用任何依赖。没有覆盖下面列出的未实现校验 |
| 测试装配（`./testing`） | `createMemoryAgentJournal`：单进程、非耐久的内存 `AgentJournal`，按[同形清单](docs/architecture/mechanisms.md#两种实现必须同形的事实)第 1 至 15 条实现全部 18 个成员，参加者集合由选项给定，可在指定操作上编排 `unavailable` 与三种 `commit-unknown`。各端口的可编排替身、`createManualAgentClock` 与手写的 `ToolRuntime` 替身。`createTestAgentDependencies` 返回 17 项依赖（`registration` 为 null）与各替身的控制手柄，`models` 是 `model-contract/testing` 的脚本化提供者 | `./testing` | `tests/memory-journal.spec.ts` 按同形清单逐条核对，用例名带条目号。`tests/fixtures.spec.ts` 为每个编排接口各有一条用例。只有一个进程，耐久性、崩溃与跨进程没有覆盖 |
| 尚未交付的宿主与提供者 | 四个面的操作本体（`observe` 除外）与全部 Loop 节点（#502 阶段 1 起）。耐久 Journal 提供者 `agent-journal-local`。真实的 Context、HITL、授权、Session 适配器与材料存储 | 无 | 没有证据 |

工厂没有实现下列创建校验，因为工厂收到的输入判定不了它们。它们留给拥有者或后续的卡：

- 待拥有者：绑定的租户与安全作用域是否一致（`denied`）。`scope` 是 `Evidence`，不携带租户，也没有依赖端口能在创建时判定它。
- 待拥有者：精确采用 `binding.definition` 与 `loopGuardPolicy` 能否解析（`unavailable`），以及经定义判定 tools、admission 与 extensions 是否必需。`AgentAdoptions.resolve` 要求 `Access`，工厂不接收 Access。`loopGuardPolicy` 由循环判断解析，循环判断在 #502 阶段 3 实现。
- 待 #558 M04-3：外部协调者的参加怎样声明。工厂只比对 `capabilities.participants` 能表达的 `CallerCommit` 种类。独立装配（`jointCommits` 为空）照常创建。
- 待拥有者：`observe` 的 Access 缺租户时，契约没有 `invalid` 的结束原因。当前实现不调用 `access.check`，以 `denied` 结束（失败即关闭）。

内存 Journal 对三项待裁定的事实取下列临时做法。每项在源码注释、测试名与本表都写明「临时做法，待 #558 裁定」，裁定后同波修改。

- M04-4：`commit` 与六个记录方法（`submit`、`control`、`acknowledge`、`recordResult`、`recordControl`、`recordTerminalObservation`）成功写入时都推进 revision。同操作的重试认回原回执，不推进。
- M04-5：`recordResult.transfer` 为 custody 或 processed 时，没有声明对应参加者，提供者也自行建立保管或完成依据。`commit.caller` 的非 none 种类没有声明时返回 `unsupported`，不保存任何部分。
- M04-7：`open` 不追加事件。第一个事件来自之后的一次提交。

下列做法同样是「临时做法，待 #558 裁定」：

- M04-1 的读法：`control` 与 `recordControl` 按 SPEC [六个阶段](../agent-contract/SPEC.md#六个阶段)把阶段事实投影为 control 事件。同一阶段以同一依据在新的操作身份下再次登记时，认回原回执，不推进 revision，不重复投影。ended 之后，`recordControl` 照常记录阶段事实，但不投影事件：ended 事件是 execution 的最后一个事件。
- `tryFinish` 的 blocked：按 operations（本 execution 有未定的写入）、controls（某个适用阶段登记为 unresolved）、inputs（普通终结时有未被已取批次覆盖的受理输入；取消终结不因此受阻）、custody（结果既无保管依据也无完成依据）的次序检查。SPEC 没有写明条件的地方取更严格的读法。passages 不检查：终态前经过是否完成并绑定本候选，是协调者的事实，Journal 从自己的记录判断不了。

内存 Journal 不实现没有类型承载的写入（最终请求记录、退避时刻与下一检查时刻，见 M04-2），也不投影 stream 与 producer 事件（M04-1）。任何方法都不在 ended 事件之后追加事件。每个返回 `commit-unknown` 的调用都留下 `query` 可判定的记录：写入生效为 committed，没有写入为 excluded，无人能定时为未定（列在 `unresolved`，由 `attach` 围栏排除或由 `settle` 判定）。操作记录与未定写入都按租户保存：其他租户的写入在任何编排故障之前就返回 denied，不进入未定集合；`unresolved`、`attach` 的围栏、`tryFinish` 的 operations 检查与 `settle` 都只看本 execution 所属租户的记录；`query` 不向其他租户透露 execution 是否存在。

## 使用

根入口提供 `createAgentRuntime`：它校验装配并返回 idle 的 provider，但还不能受理 execution。后继消费形状见[入口设计](docs/public-api.md)。测试把 `@omne-harness/agent/testing` 作为入口：`createTestAgentDependencies()` 返回 `dependencies` 与 `controls`，测试经 `controls` 中每个替身的 `Script` 设定回答（`always` 设定常设回答，`once` 设定下一次回答，`calls` 记录每次输入），经 `controls.journal.failNext` 在指定写操作上制造 `unavailable` 或 `commit-unknown`。替身只供测试，不能装配进生产。

## 契约

[SPEC](SPEC.md) 拥有行为，公开形状与现有导出见 [入口设计](docs/public-api.md)。

## 设计

[架构](docs/architecture/README.md) 拥有机制和依赖理由，其他主题从 [文档索引](docs/index.md) 进入。

## 配置与运行

不把业务身份放入配置。本包不依赖 Cordis 或具体宿主。

## 验证

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/agent test` 先构建再运行测试，`pnpm --filter @omne-harness/agent typecheck` 核对类型。测试核对公开入口、导入图与清单依赖，工厂的四种创建失败与 idle，四个面的访问守卫，内存 Journal 的同形清单与三项临时做法，以及每个替身的编排接口。测试不证明运行能力已经支持。测试的组织见 [tests/README](tests/README.md)。

## 维护

修改公开承诺同步真实消费者、SPEC 和验证；实现机制不反向改变契约。组内责任见 [组入口](../README.md)。

## 目录结构与文档职责

完整骨架沿源码包模板；六个主题及其子页见 [docs](docs/README.md)。源码、测试、schema、verification、adr、examples、resources 与 acceptance 各有索引。空资源目录保留草稿说明，不授予模板采用或业务接受。
