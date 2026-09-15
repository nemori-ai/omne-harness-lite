# 目标与范围

本页保留原 M1/M2 路线的范围及排除理由。后续[最小节点选择](runtime-baseline.md)
收窄交付节点，完整 HITL/OpenRouter 范围与已确认要求仍保留；当前装配与实际
覆盖归[local-harness 设计](../../../../apps/local-harness/design.md)，本页不维护排期。

## 要交付的结果

有权用户在本地应用中创建或恢复属于明确租户的 Session，提交文本；系统建立
具有精确身份和执行权的 Run，经 OpenRouter 取得工具建议。工具定义自己声明
命令、参数、权限和确认需求；装载自动发布匹配的声明索引，执行入口根据当前
身份、定义授权、会话模式和用户授权判定 allow/deny/ask/unavailable。

ask 必须在受控效果发生前保存原动作、待办和等待位置。用户可从 Session 或
统一池读取并答复同一请求；批准经当前重检只允许原 attempt，拒绝产生真实
未执行结果并允许合法后续。关闭客户端、释放活体 Agent、重启应用，都不能
丢失待办、重复决定、搬用批准或自动重发效果未知的调用。

最终交付是可启动的本地应用、真实提供者、可复用职责包及绑定实际源码的证据。
离线验收使用可控制的模型传输端，最终还须有真实 OpenRouter 文本/工具往返证据；
仅演示 approve 按钮、内存 Promise 或一个 permissive mock 均不达标。

## 本批覆盖

| 边界 | 本批完成范围 | 依据与完成后的仍有缺口 |
|---|---|---|
| 租户与可信调用者 | 自然人/成员分离；个人和组织租户；成员状态与撤权；原定义身份、不可变版本、选用及有效权益；本批操作的读取/写入/答复/控制授权 | [SYS-TENANT](../../../requirements/system/constraints.md#sys-tenant)、[PF-001](../../../requirements/product/user/PF-001-tenant-organization-context.md)、[PF-006](../../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md)、[PF-010](../../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md) 的本流程子集；完整资产管理、外部身份平台和租户关闭清算后续交付 |
| 活体与 Session/Run | 唯一激活、附着、准入、退出；耐久文本输入/编辑/撤回/排序/取批；安全位置与精确 interrupt/resume/cancel/force_stop、队列 hold；历史和状态投影 | [SYS-RUNTIME-CONTINUITY](../../../requirements/system/runtime-state-and-continuity.md)、[PF-013](../../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md)；不实现有序命令、interrupt_then_run、自动标题、归档/删除的完整应用管理 |
| 工具与系统审批 | 多命令单槽位；工具/独立 skill 发现装载；完整参数校验；自动声明登记；三种确认模式、持久 grant 与一次决定；多个系统待办独立接续；双入口读答 | [PF-003](../../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md)、[PF-014](../../../requirements/product/agent/PF-014-runtime-tool-and-skill-discovery-and-loading.md)、[PF-024.C1/C2](../../../requirements/product/agent/PF-024-multi-command-tool-definition.md#已确认要求)、[PF-007.C1–C5](../../../requirements/product/user/PF-007-system-initiated-hitl.md#已确认要求)、[PF-008.C2–C7](../../../requirements/product/user/PF-008-unified-decision-pool.md#已确认要求)；池先接系统审批，不能宣称已覆盖所有 HITL kind |
| 执行与动态变化 | 独立于活体 Agent 的本地受信工具执行 owner；原 attempt 的 start/inspect/stop、迟到启动墓碑；帧和终态分离；工具/skill/解析器换代与撤除 | PF-003/PF-014 和 [SYS-DYNAMIC](../../../requirements/system/fully-dynamic-system.md) 的这一部分；不实现 detach/自动转后台、任意代码沙箱或插件在线分发 |
| 模型与上下文 | 真实 OpenRouter 文本流及客户端工具协议；精确 manifest；固定 Run 模型；下一 Run 选用；原始记录、工具关联、必需 skill 与待答回执；流中断和未知分类 | [SYS-LLM](../../../requirements/system/constraints.md#sys-llm)、[PF-023](../../../requirements/product/user/PF-023-session-model-selection-and-continuity.md) 的文本范围；不实现跨模态切换、自动压缩、标题或其他辅助模型工作 |
| 耐久性、预算、观测 | 同一业务协调域内联合提交、OS 强制独占 writer、故障恢复；本批 attempt 的预算立场/预留/结算/未知暴露；关联审计、查询与缺口 | [SYS-OBSERVABILITY](../../../requirements/system/observability-and-logging.md)、[PF-019.C2–C5](../../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md#已确认要求) 的本地计量预算部分；不接支付、订阅变更或正式账单 |
| 应用 | 单机常驻宿主、CLI 客户端、Session/Run/审批池/设置与诊断操作；断开客户端不取消服务工作 | [SYS-DEPLOY](../../../requirements/system/constraints.md#sys-deploy)；不交付 Web UI、移动端、远程节点、集群或生产服务上线 |

这里的“子集”只限制开放的操作/内容/提供者种类。**已开放路径必须完整兑现它依赖的
授权、耐久性、幂等、取消、失败和恢复义务**，不能以分批为由先开放绕门的版本。
未开放的操作由能力声明明确不可用，入口在受理前拒绝，不静默降级成相似操作。

## 明确排除

- 多模态输入/生成、媒体上传/保留/GC、slash 和 keyboard、有序命令及其清除策略。
  共享数据仍沿精确规范；本批内容准入只允许 text，遇到其它块明确拒绝，不抹掉原块。
- Agent 主动 question/approval、专属设备或外部账号同意、合格暂行确认及撤销 DAG。
  系统审批不能替代这些资格；需要它们的工具命令不发布为可调用。
- 子 Agent 派发、日程、跨会话通信、selfound、完整制品与隔离副本、Connector。
- shell/browser/computer 全套工具、Agent 编写代码的受限执行、工具后台存活保证。
  首批仅装载部署信任的实现；Cordis scope 不作为恶意代码安全隔离。
- 网络文件系统、Windows/macOS、任意进程栈恢复、无间断存储迁移、分布式接管。
  首批选择 Linux 本地文件系统；具体被验证的 OS/内核/文件系统/挂载条件随证据列名。
- 严格财务封顶的泛化承诺。已知上界与未知上界依 BG 分别处理，缺 usage 不算零费用。

以上继续是产品待交付项。后续批次优先接本流程上的独立后台执行/复合控制、
其余 HITL、多模态与模型切换，再按需求组织其它功能；本包不预先冻结其施工顺序。

## 对已有设计与 fork 的处理

保留 D-005/D-007 的运行所有权、D-008 的状态权威与共同准入、D-009 的职责布局。
目前发现的是**源行为与目标契约的明确差距**，尚无证据要求撤销这些目标选择：

| 当前源事实 | 本批改造及原因 |
|---|---|
| scope 是可见性与路由，agent 仍为上游 registry/factory 基线 | 保持唯一 scope；直接演化 agent 生命周期与受限入口，实现 AR/CB，不能用 scope 标签冒充授权 |
| tools.execute 查当前同名工具并等待 body | 演化为精确 manifest/Action/attempt 的受控调用，真实执行移交独立 owner；防止旧批准跟随同名新工具 |
| Session 内存事件/投影和普通 JSONL I/O 尚无共同提交协议 | 保留有用 fold/文件算法，重构产品记录入口；防止 UI、审批与执行各自成功却无法恢复一致状态 |
| LLM 源装配缺少 finish 时可按普通 stop 处理 | 目标入口须由显式传输终止证据分类；无 finish 的断流不得变为模型成功或执行不完整工具参数 |
| 旧 Loop 仅有上下文/流投影片段 | 在所属包实现本项目 Run 驱动，不恢复 DSH inbox/审批/后台等旧政策 |

源依据分别见[源基线](../fork/source-baseline.md)、[工具](../fork/tools-source.md)、
[JSONL](../fork/jsonl-source.md)、[模型流](../fork/llm-source.md)。不为保留旧测试而
保留冲突行为，也不因为代码来自 fork 就全部重写。纯函数与资源原语能满足目标时
直接复用；涉及行为变化先写目标反例，记录源测试保留、替换或删除的原因。

发现正式契约自相矛盾、无法兑现或成本没有相称收益时，先提供精确条款、可复现
交错与影响；在所属提案提出最小修订，独立评审后按接受权限发布新版本/取代决定。
冻结 v1 不覆盖，未受影响的实施可以继续；不得默默把强保证改成 best effort。
