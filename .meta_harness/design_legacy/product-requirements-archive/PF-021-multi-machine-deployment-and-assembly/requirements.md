---
kind: product-feature
id: PF-021
primary_dimension: environment
secondary_dimensions: [user, agent]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/environment/PF-021-multi-machine-deployment-and-assembly.md
source_sha256: d0ba1274a5dc80b24987ab1bafd2891a962ece1ae00af397f9d5cd6d7d673538
source_anchor: "heading:# PF-021：多机器接入、工作部署与动态装配"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-021：多机器接入、工作部署与动态装配

[环境维度](../by-environment.md) · [Cordis 与来源核对](../../../research/legacy_backup/requirements-gap-resolution-sources/research.md)

2026-09-12 用户接受 GAP-8，并要求“部署”和“装配”结合 Cordis 视角表达。
主维度为环境，副维度为用户、智能体。本条纳入产品目标；阶段仍遵循
[SYS-DEPLOY](../../system/constraints/requirements.md#sys-deploy)：第一版完整交付为单机，
后续多机扩展保持领域语义，不因本轮记录提前承诺首版集群。

## 要求与本轮细化

- **PF-021.C1：有权用户能接入和管理多台机器。** 能显式接入自己的其他
  机器，辨认其身份、归属、信任状态、可承接工作及容量，暂停或撤回其承接新
  工作的资格。已信任设备、可执行 Agent 的节点和被 Agent 操作的资源分别
  表达，不因设备接入自动授予其全部计算、文件或桌面操作权限。
- **PF-021.C2：逻辑装配与物理部署分别可辨。** 装配说明选用哪些版本的
  插件/服务、配置、依赖与作用域绑定，使哪些能力成立；部署说明这些运行实例
  在哪些机器、进程和实际环境运行，如何取得对应代码、资源与配置。一个插件
  不必对应一台机器或一个微服务，一个 Context 也不是物理节点或远程身份。
- **PF-021.C3：按真实环境形成合格装配。** 系统依据工作需要、当前模型
  能力、目标 OS/架构、资源及有效权限，使用合适的实现提供者、装配配置或部署
  版本。相同服务名称不证明不同环境能力等价；候选需具备所需工具、技能、状态、
  制品及依赖路径，未知、不兼容或未就绪时不冒充可承接完整工作。
- **PF-021.C4：期望装配、实际就绪和工作落点可见。** 用户及获准 Agent
  能查询目标期望的版本/配置、当前实际实例与依赖状态，以及工作在哪里执行、
  为什么可在那里执行和当前结果。代码已分发、插件已登记、服务已注册、整个
  工作可完成是不同事实；局部失败明确显示，不能以进程存活作为完整就绪。
- **PF-021.C5：接入变化不混淆既有执行。** 停止承接新工作、撤销访问资源
  权限、请求终止在途工作和删除设备记录分别表达，既有工作按明确政策收口并
  回传结果。失联不能直接显示已经停止或未执行；恢复/接管须保持原工作身份与
  执行所有权，不能因旧节点迟到就出现两份被视为合法的同一独占执行。
- **PF-021.C6：动态调整保留持久性与兼容边界。** 支持在适用环境中更换
  提供者、调整获准装配并观察效果，在线插件变更遵循 PF-016。运行时重建按
  保存的状态和当前获准装配接续，已有后台调用依 PF-003 重建联系。能部署到
  两种环境不自动证明可以在其间无损迁移任意在途状态。

## 最小技术义务与关联

Cordis 提供插件树、服务注入、作用域与生命周期组合；跨进程或机器的能力
必须另有可表达身份、授权、输入结果、失败及恢复的契约，不能传输 Context
对象引用就视为完成远程装配。可用本地或远程提供者实现相同能力，但远端
断连、请求结果未知与实际取消结果必须保留。

本轮只提出上述设计义务，不选择节点管理平台、容器系统、RPC 框架、服务发现、
调度算法或统一插件进程布局。支持矩阵须明确具体版本、环境和验证依据；
高可用、任意异构热迁移以及组织共享设备的完整管理规则仍需另外展开。
环境权限引用 [PF-012](../PF-012-computer-browser-shell-sandbox-and-native-use/requirements.md)，
局部故障引用 [PF-020](../PF-020-dependency-availability-and-degradation/requirements.md)，
恢复目标引用 [SYS-RUNTIME-CONTINUITY](../../system/runtime-state-and-continuity/requirements.md)。
