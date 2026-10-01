# Relay：从产品需求到 Harness lite 的实现投影

需求基线：2026-09-30讨论稿1.0。规模：1万早期注册用户。以Harness lite已承诺目标态为基础，逐项说明产品怎样实现、外围还需建设什么、执行路径如何接续，以及工程规模与验收前提。

[打开完整报告](report.html)。报告包含165项功能、23条用户旅程、12条执行路径、SaaS外围与58节点建设拓扑。方案为可审阅候选，不代表已实施或新增框架接受。

## 阅读顺序

1. [主报告](design.md)：可行性、框架承接、产品建设责任与规模。
2. [逐功能投影](feature-projection.md)：165项需求的动作、状态、失败、验收和依赖。
3. [旅程验收](journey-acceptance.md)：完整体验及跨时间的纠正、撤权与恢复。
4. [执行拓扑](execution-topology.md)：触发、授权、真实效果及后续工作。
5. [SaaS外围](peripheral-design.md)：统一身份授权、数据、部署、资源接入、观测、费用与退出。
6. [部署候选](alternatives.md)：三种承载方式及采用条件。
7. [建设计划](delivery-plan.md)：工作包、实施依赖、实际验证与工量校准。

精确输入和框架依据见[研究资料](../../../../research/ai-assistant-saas-projection/README.md)，机器清单见[data](data/README.md)。
