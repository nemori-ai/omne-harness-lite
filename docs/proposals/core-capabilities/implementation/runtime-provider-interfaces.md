# P2 运行提供者设计：来源与推进入口

本文保留本次提供者设计的来源、范围、评审与实施导航。具体插件、服务、host、
当前资格和资源映射已经迁入下表的所属包/应用正文，不在施工稿维护第二份接口。
迁移及评审消歧已接受为最小运行基线的施工输入；目标产品尚未实现。

## 来源、范围与接受状态

- 原始设计基线：`61e732b979098f568ccd5d21d21939ff0c5036c4`。
- 首个相邻服务键候选：`947885ca5d89b05678d8265b6ff2a7f0d8b47823`。
- 完整受审设计：`5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18`，完整原稿可由
  `git show 5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18:docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md`
  读取；原始机制输入/结果继续保存在 [evidence](evidence/runtime-provider-design/README.md)。
- 本次迁移实际起点：`ac4eb3f3148de5a4b2b45589d77d9d9157f39cb6`，已合入
  `1368c52b7255e16e9c2fcde30eebca6f870679f7` 的更新计划及已采用维护规则。

正式语义按 [catalog](../../../../spec/catalog.json) 的 TG/AU/BG/SR/AR/CB/CC/DR、
identity/core-work v1；逻辑实施接口沿已接受 [治理稿](governance-interfaces.md)
`058c77c`、[Session 稿](session-runtime-interfaces.md) `cd16f1`、
[共享稿](shared-interfaces.md) 与 D-005/007/008/010。迁移未改冻结规格，
也未更改已接受状态机、结果、事件或原子参与者分工。

本会话以更新后的 [最小运行基线](runtime-baseline.md) 为最终交接点：真实 P1、
当前身份/授权、本地预算、Agent/Session 与多命令文件工具的一次 allow、原结果、
恢复和关闭。完整 M1/M2、完整 HD、模型/媒体和扩展观测保留为后续设计输入，
不再自动继续实施；ask 未开放时必须明确不可执行。相关验收沿
[acceptance](acceptance.md) 中基线实际依赖的子场景，完整目录不因此被伪报通过。

## 当前正文及迁移对应

| 所属正文 | 从原稿迁入的责任 | 当前实施状态 |
|---|---|---|
| [Tenant](../../../../packages/governance/tenant/design.md) | TG host/服务与身份消费协议、当前资格、引用来源、装载/撤除 | 目标包未实现 |
| [Authorization](../../../../packages/governance/authorization/design.md) | AU host/服务、Session/Action/资源/决定事实注册、重载与批准历史边界 | 目标包未实现，完整 HD 后置 |
| [Budget](../../../../packages/governance/budget/design.md) | BG host/服务、真实来源注册、原预算/attempt/period 责任与本地验收 | 目标包未实现 |
| [Agent](../../../../packages/core/agent/design.md) | Registry/Factory/RuntimeOwner/实例插件、唯一活体、pin/退出/旧代隔离 | 仅现有 fork baseline，目标默认入口未实现 |
| [Session](../../../../packages/session/session/design.md) | SR host/服务、三个 link、attachment/当前委托、原 Step 接续及恢复 | 仅现有 fork baseline，目标默认入口未实现 |
| [persistence](../../../../packages/session/persistence/design.md) | 受限 reader、同水位 decoder/fold/checkpoint 恢复与释放 | 目标恢复过程未实现，不造插件 |
| [projection](../../../../packages/session/projection/design.md) | 版本化视图、贡献、查询适配与撤除 | 目标服务未实现 |
| [local-harness](../../../../apps/local-harness/design.md) | 实际提供者选择、身份/P1/Factory 插件、固定 host 集合、挂载/启动/退出链 | 应用未实现，无可运行命令 |

服务键未因迁移改变；精确当前插件/inject 和公开符号只在上述所有者维护。
原纯数据/records 继续由公开端口/codec 承载，不新增 records 服务、第二
coordinator、通用 Host 框架或全局状态/事件服务。包 README、spec 可变入口和
全局导航由整合者同次维护，本次作者未越界修改。

## 评审消歧与机制证据

[独立评审](review.md#p2-提供者映射评审) 对固定 `5ffba4b` 技术主链未发现新阻断，
要求消除“一次决定不复活”的表达歧义。当前 AU 正文明确：失效的是旧
`DecisionFacts` 私有候选/运行句柄；未消费、未关闭的耐久批准历史仍由 HD
保留。当前 HD owner 可以为原 Action 重新发行候选并按当前资格重检，普通
AU/link 重载不自动取消批准；一次批准不变成持久 grant。本修订不新增业务语义。

原三项 Cordis 4.0.2 探针覆盖延迟发布、UNLOADING 到 disposer 的异步窗口和旧
普通引用残留。工具作者固定 `0a6e91ea643497f309f1a69f8adecc8a98751df3` 的
`evidence/tool-decision-design/cordis-current-window-output.json` 与
`cordis-source-check.json` 进一步确认 ctx.plugin 返回 PromiseLike 外壳、较早
监听器重入及同 Fiber 重载。当前各插件改为在受信 apply 捕获 c.fiber/本代挂载；
最后门检查自身和所有必需 provider 的当前代次/存活，再独立认证授权，不能
只依赖 effect、symbols.original 或消费者 ACTIVE。此次复用固定证据，未重跑
无变化机制，也未将其称为业务当前检查或产品组合测试。

诊断目录 owner 已由 [D-011](../../../decisions/D-011-diagnostics-directory-ownership.md)
在 `e2190ad0f9df571eb7e6fb5d36099cf3af589a73` 接受，当前创建/关闭设计归
[diagnostics](../../../../packages/observation/diagnostics/design.md)。实际目录修复
仍待产品验收；应用消费这个已接受设计及随后交付的真实公共入口。

## 接受与验证

主调度接受 `f98ac92650beb46bb1e4bc993995e21800a300a2` 的七个包及应用映射，
范围为本页列出的最小运行基线。该提交经 `8ee3af6fbec592780aa139219d338a16454501d7`
合入 HUB；原 architecture-reviewer `/root/review_first_batch` 定点复核已确认
AU 历史批准与旧私有候选的消歧闭合，原代次/必要 provider 当前检查与工具稿
`0a6e91e` 一致，未发现新的迁移阻断。详见[复核记录](review.md#p2-提供者映射评审)。

HUB 核对固定来源并复跑三组原 Cordis 探针及两组工具当前资格机制探针，原始
输出与作者相同，见[机制证据](evidence/provider-design-hub/README.md)。合入后
`make docs-check BASELINE=e2190ad` 通过 451 份文档；这些结果只支持设计采用，
不证明业务门、恢复或应用已实现。完整 HD、模型与超出基线的部分仍保留后续，
本次没有发布或修改正式 v1，也没有开放依赖未交付产品的实施路径。

## 实施推进与未关闭义务

实际安排归 [plan](plan.md)，目标/停止条件归基线页。实施依赖不因正文迁移消失：

1. 先完成 diagnostics 目录产品修复与真实 P1 records/jsonl/admission 组合，保留
   唯一 writer/coordinator、双视图、真实锁和同步 publication 的实际证据。
2. 原 TG/AU/BG、AR/SR、恢复/投影 owner 消费各自当前设计快照和默认公共面；
   在已固定类型上并行，真实身份/当前来源缺失时依赖路径不得 GREEN。
3. 按已对齐的工具稿 `0a6e91e` 实现共同端口，实际 allow 链消费真实
   TL/LE/资源权限/费用来源。完整 HD 实施不作为本会话前置。
4. 应用按自己的装配正文验证基线的 A01–09/A11/A17/A18/A26 本地及 A28–32
   相关子场景，包含真实撤权/失联、双 Context 唯一性、原结果恢复、预算并发/
   unknown 和清理残留。具体 owner 的测量义务随包正文维护，不用内部 Map
   次数、声明编译或既有源测试抵扣。通过后固定可运行提交、证据和交接并停止。

当前没有本迁移稿的产品符合性结果；正文保留所需 RED→GREEN 方向及未实现状态。
文档检查只核对链接、来源与冻结等结构，不提供设计接受或产品实现结论。原
`5ffba4b` 的 419 Markdown 检查和三组机制结果继续绑定当时版本；本次检查
另以迁移起点保存原始输出，不投影成更广范围通过。
