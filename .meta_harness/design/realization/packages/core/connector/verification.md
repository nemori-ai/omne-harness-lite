# connector 验证与证据

契约侧的证据义务权威在 [`spec/data/connector/verification.md`](../../../../spec/data/connector/verification.md#证据义务)（V-1～V-6、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～5 节逐行；第 7 节按 asset-model 的 `AssetContent`、第 8 节按属性声明；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内可复跑测试核对本行观察；单次输入与结果留本工作树 tmp |
| V-2 拒绝值的具名与优先级 | 每个拒绝行逐字相同；第 5 节五行专验优先级 | 未开始 | 本节点 |
| S-11 推不出 | 推出规则对任一连接件正文交回 `underivable`，不交回部分项 | 未开始 | 本节点；G-4 闭合后改为六项逐一核 |
| V-3 规范场景的表示层那一半 | S-20、S-21 的表示层部分与 S-23 | 未开始 | 本节点；受理那一半归受理 |
| V-4 消费者走查 | CS-1～CS-5 结构化走查（CS-1、CS-2 停在 G-4、G-5、G-10） | 未开始 | 本节点与求值、受理节点共同走查 |

**不在本节点**：V-5（跨进程，本版装配下无法演练）；V-6 的 SC-1～SC-4（消费者）。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **推出规则受阻于契约 G-4**（CN-1）。owner：PF-002 的 owner。
