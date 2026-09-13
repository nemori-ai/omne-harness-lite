# 需求消费基线与覆盖

本次消费提交 `f580718295daaec0f42d3262643e95281c493063`。以下路径及条款均指
该提交中的确认范围，未决部分不在本轮替用户裁决。保留与独立恢复证据见
[基线记录](../evidence/requirements-baseline.json)。

| 需求及当时路径 | 本轮覆盖 | 保留缺口 |
|---|---|---|
| [SYS-KERNEL、SYS-SPEC、SYS-DEPLOY、SYS-TENANT、SYS-LLM](../../../requirements/system/constraints.md) | 自维护 agent 原语与官方 Cordis 分界；语言无关模型；租户入口；可传输身份及单机协调边界 | Cordis 实际发布版本/兼容测试、分布式执行权及 OpenRouter 实际驱动 |
| [SYS-DYNAMIC.C2](../../../requirements/system/fully-dynamic-system.md) | 定义/提供者/绑定/实例分离；必要贡献失效与合法替换 | C1 最终完全动态判据仍未定，不声称本版满足全部量词 |
| [SYS-RUNTIME-CONTINUITY.C1–C3](../../../requirements/system/runtime-state-and-continuity.md) | 运行态不拥有持久事实；重建实例保留 Session 关联；确切装配绑定 | 耐久状态格式、合法恢复点、同构/异构兼容判据与恢复保证 |
| [PF-001 确认正文](../../../requirements/product/user/PF-001-tenant-organization-context.md) | 显式租户、默认拒绝、对象操作权限门 | 多组织效用、成员管理及完整授权规则 |
| [PF-003.C4–C6](../../../requirements/product/agent/PF-003-tool-execution-observation-and-control.md) | 独立工作不随运行时销毁；移交须有真实新 owner | 前后台转换、重关联协议与工具结果语义 |
| [PF-004.C3–C5/C10](../../../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md) | 运行宿主与业务父系/临时 master 分离；定义授权不被实例代际替代 | 三种关系、动态委托权限、耐久派发/回流、监督与定时机制；完整继承义务未缩小 |
| [PF-006.C2/C5](../../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md) | 保留定义关联；下一次准入查当前授权 | Definition 数据、版本演进授权、设置优先级 |
| [PF-013.C1–C7](../../../requirements/product/user/PF-013-session-run-lifecycle-and-pending-input-control.md) | Session/Run/活体分离；旧实例不能控制新实例；退役不暗中变成用户取消 | Session/Run 精确状态、执行代际、force_stop、队列与 interrupt_then_run 完整组合 |
| [PF-016.C3/C5、T3–T5](../../../requirements/product/agent/PF-016-agent-developed-cordis-plugins-and-live-deployment.md) | 受信实现前提；在途贡献受管、局部撤除不影响无关工作；有限信任插件接入有执行边界义务 | 插件实际执行隔离、构建/验证/部署和持久装配协议，本轮不以 Context 当安全证明 |
| [PF-020.C1–C5](../../../requirements/product/environment/PF-020-dependency-availability-and-degradation.md) | 实例必需、操作条件和可选贡献分开；局部不可用不冒充空结果或全系统离线 | 网络恢复、缓存、授权可用性及各装配的完整支持矩阵 |
| [PF-021.C2–C6](../../../requirements/product/environment/PF-021-multi-machine-deployment-and-assembly.md) | 逻辑装配与实例/部署分开，实际绑定和唯一执行边界可表达 | 节点接入、跨进程执行权、OS 兼容与恢复/接管实现 |
| [PF-023.C1/C2/C6](../../../requirements/product/user/PF-023-session-model-selection-and-continuity.md) | Session 装配不永久冻结，工作稳定绑定，运行代际与模型版本分别表达 | 合法切换、耐久模态/窗口/压缩、下一 Run 生效及实际模型事实 |

实际没有兑现的产品行为列为缺口，不以“留接口”算完成。其他 PF 要求仍约束后续
能力，但本轮不另建对应产品机制。没有修改需求正文、接受既有 tenant/model/agent-core
候选，或取代 D-001–D-004。源基线采用旧提交的事实与本次目标消费基线分别保留。
