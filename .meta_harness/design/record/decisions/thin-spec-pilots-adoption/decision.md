# N4：治理与模型重试薄规格试点的限定采用

状态：已接受下述限定迁移、实施与验证范围。

接受依据：负责人 panqiwei 于2026-10-04要求“自驱地推进开始完成 N4 的实施交付和验收”。主会话按该委托完成技术采用；本记录不冒充负责人逐项阅读或浏览器试用。

输入为 BASE `92b4e7dec8c066655992662820b38b0eb96ea089` 上的产品候选 `5d0d402fce4d24406daf4d2a5ffa81ca9e70cf2b`。
冻结范围 SHA-256：`219fa17a1fb66d531800b5e36c1f2a0419d061f8e6b99aef03f86193d165f018`。
设计依据为 [全局实际架构与薄规格决定](../actual-architecture-and-thin-spec/decision.md)、[Cordis 集成约定](../cordis-integration-conventions/decision.md)和[系统架构意图](../system-architecture-intent/decision.md)。
来源研究为 [architecture-judgment-aids](../../../../research/architecture-judgment-aids/research.md)与 [clean-code-doctrine-current](../../../../research/clean-code-doctrine-current/research.md)，未重复开展完整调研。

## 接受及取代范围

接受[承诺归属清单](../../../architecture/pilots/n4-ownership.md)所列的精确接口/集成/纯函数及当前提供者投影范围。
公开类型和五份模块旁 SPEC 是这部分的唯一现行源，必要理由归 SQL ADR。承诺按已有有效条款和已接受 IC 表达，业务规则未向当前实现让步。

- 治理定义拥有四个公开 Service 及 Context/Events；SQL 是可替换提供者，四面共用一个 fiber 和事务域。
- 模型试点只采用纯 retryDelay 的现行拥有者与 local 默认策略的真实消费；完整十五方法的类型闭包仍待 N5。
- tenancy-host 拥有本批整体启动、事务域、确认/开闸和撤除承诺。旧未迁未来增量仍有原接受义务。
- 真实后续修订从已交付首批99770b后完成：公开定义消费者在实际 SQL 环境撤除、替换、重跑并认回持久事实，另核调用方 effect 清理。未新建 realization 四件套。
- 手册采用精简默认入口及对应宿主生成物。旧 references 只供未迁任务；角色全面退役未完成，仍归 N7。

旧公开源码路径、两个模型插件子入口和本批明确取代的当前实现投影退役。新消费者切换完成，无兼容别名。
未迁领域协议、业务操作、数据、Schema、模型/冻结、历史接受和原运行输入保持精确原责任；不把混合旧文件整体删除，也不改登记来假称全域迁通。

## 验证、偏离与边界

本批 L3 独立实施评审的 IR-1/2/3 已关闭，最终5d增量无新发现。独立 QA 判决及根接受结果见[本批实际运行](../../evidence/2026-10-04-thin-spec-pilots/README.md#2026-10-04-实际实施与验收收口)。评审和验收是证据，本决定另行接受明确范围。

Service 元数据及原代理身份断言的适配被接受：精确业务方法集合保持，代理使用官方底层身份作严格比较。就绪 guard 显式拒绝缺席，不隐藏缺席。
初次七处失败及其定点复跑分别保留。冷恢复原45秒阈值不改，根与 QA 隔离重跑通过；原并行 timeout 仍是实际结果，唯一根因未证明。

全局约束只更名两个候选提供者 selector 并加入两个公共拥有者的同域候选，层次保持 unknown；其他责任和规则未改。
四个治理 IC-4 静态类型闭包读数、模型/local 与其他触及存量 IC、结构读数和运行未观测继续显示。不接受新例外来消除差距。
纯 public root 装载不加载 Cordis 的测试不能证明源码/声明闭包符合；kernel-basis 分面及完整模型类型拥有者归 N5。

Session 作用域材料仅作为完成的候选设计试点。隔离、撤除、故障、在途、恢复与正向进展责任已表达；机制、API和实现未接受。
有限模型结果保持输入规模、公平性和故障前提，不证明真实 Service/IO 或任意实现。
PG 整体恢复、分布式、真实付费模型、全仓检查、完整形式/角色基准及 N5～N8 没有据此完成或开工。
