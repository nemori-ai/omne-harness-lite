---
kind: product-feature
id: PF-020
primary_dimension: environment
secondary_dimensions: [user, agent]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/environment/PF-020-dependency-availability-and-degradation.md
source_sha256: fb0dbc8db8f3ca9a41395bbbeda7b6a48ad65a650185e0fa28dfd5a0796d8a4b
source_anchor: "heading:# PF-020：依赖可用性、局部离线与诚实降级"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-020：依赖可用性、局部离线与诚实降级

[环境维度](../by-environment.md) · [Cordis 与来源核对](../../../../research/legacy_backup/requirements-gap-resolution-sources/research.md)

2026-09-12 用户要求结合 Cordis 进一步细化 GAP-7。主维度为环境，副维度为
用户、智能体。以下把局部离线理解为：按实际装配、依赖和权限判断哪些能力
仍能工作，哪些应等待、降级或拒绝，不把“离线”当作整个系统的单一开关。

## 要求与本轮细化

- **PF-020.C1：不受影响的能力保持可用。** 在主机和所需本地服务仍工作的
  前提下，公网或某远端依赖故障不应使所有本地能力失效。具备本地数据、有效
  身份/权限及完整依赖的历史/状态读取、管理操作、已有日历和通知读取等可继续；
  某项实际依赖远端时，按其真实条件处理，不从界面入口在本机推导它必然可离线。
- **PF-020.C2：可用性精确到能力及操作。** 区分未装配、未启用、等待必要
  依赖、运行中但远端不可达、部分功能降级和就绪。用户及 Agent 能辨认受影响
  范围、原因与可选动作；不可用查询不能假报空结果，过期缓存不能假报当前事实，
  未送达、未持久确认的请求不能显示为已完成。
- **PF-020.C3：装配表达真实依赖。** 必要依赖缺失时阻止相应能力就绪；
  可选依赖缺失仅影响声明依赖它的功能。Cordis 的依赖驱动装载/卸载为此提供
  基础，但远端连接故障不自动等于本地服务注销；仍注册的适配服务必须如实
  反映可调用性，消费者不能只看插件已装载就宣称外部操作可成功。
- **PF-020.C4：降级保持授权与状态边界。** 公网断开、客户端到系统断开、
  执行节点到权威状态/权限方断开、子系统间断开分别判断。需要新的有效授权或
  持久确认而无法取得时，明确等待或拒绝；已有工作只能在原获准有效范围内继续。
  本地草稿、缓存或暂存意图与系统已接受事实分开，不因断网自行扩权或创建竞争执行者。
- **PF-020.C5：恢复后接续真实工作。** 重连后重新确认身份、权限、目标
  状态和兼容性，再接续等待项或同步结果。区分未执行、已执行但回执丢失、仍在
  远端执行和结果未知；不对不可安全重复的行动盲目重放。缓存/排队有明确容量
  与失败反馈，不能靠无限缓存维持表面可用。
- **PF-020.C6：模型网络边界保持一致。** 所有模型请求仍遵循 SYS-LLM
  经 OpenRouter；该路径不可达时相应新模型请求不可用。不将已有结果、文本
  替代品或擅自改用本地模型呈现为同一次请求成功。本条不承诺完全离线运行
  需要新模型推理的完整 Agent，也不承诺主机断电后继续工作。

## 最小技术义务与关联

每个支持的装配应说明必要/可选依赖、依赖位置、可观察就绪条件、断连时允许
的操作与恢复边界；声明必须可用断连/重连场景验证。Cordis Context 内的依赖
关系不替代跨进程状态、授权和交付契约；内核的 PENDING 可以是合法状态，但
产品不能让用户只看见没有解释的沉默。

动态装载归 [PF-014](../PF-014-runtime-tool-and-skill-discovery-and-loading/requirements.md)，
插件在线变更归 [PF-016](../PF-016-agent-developed-cordis-plugins-and-live-deployment/requirements.md)，
部署与装配归 [PF-021](../PF-021-multi-machine-deployment-and-assembly/requirements.md)，
模型统一路径归 [SYS-LLM](../../system/constraints/requirements.md#sys-llm)。
本轮未选定重连协议、离线客户端、授权租约、缓存或网络栈；各部署的确切离线
功能清单和时限须在相应规格中确定，不继承旧产品的整套离线安装配置。
