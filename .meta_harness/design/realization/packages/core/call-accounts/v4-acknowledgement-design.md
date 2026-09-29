# ACK 后原账见证的纯数据接续

2026-09-29，revision1，candidate，未接受/未实施，新增binding0。输入为PF013rev17§6.19、CA4 S43及MS8/RT12/MR11同批候选，前驱D110的[v3](v3-design.md)。产品确认、架构复评与准确义务见[ACK选择](../../../../record/proposals/model-runtime-reference-lifecycle/ack-technical-choices.md)。

本节点继续纯值/计算，没有Cordis plugin/service/fiber、Storage或日志查询能力。D025 Cordis4.0.4不被本包直接消费。ACK小账见证由MS8拥有，实际选择与授权由模型runtime的当前日志读面兑现；本包不因新增来源就变成账务service。

| 契约责任 | 本节点投影 | 实施/证据状态 |
| --- | --- | --- |
| CA4既有Usage/Cost/Correction/精确金额 | 当前root采用CA4 Schema原字节，类型与既有纯judge/ExactDecimal/effectiveCost/summarize按原形状 | 形状/算法未因ACK改变，不重写计算器 |
| CA4 S43来源唯一性 | 纯summarize继续只收调用方已选的唯一账值；runtime先按同ResponseId final→ACK witness→ready，并拒绝矛盾来源 | 本包不能通过增加参数假装已查日志或授权 |
| CA4原归属/未知/补账 | 原精确数值与unknown保持，补账目标仍原ResponseId；同CallKey多个dispatch不合并 | 纯函数负控与真实runtime组合分别验证 |
| 精确资源图 | CA4全部13公开defs及其可达资源：CA4、CB2、IV1、OE1 | 全字节资源，不编译依赖无关defs；最终Schema/packed重验 |

不新增“witness修正账”函数，不从payload hash/当前价格估造原usage/cost，不把ACK算第二账项。若final已存在但与已确认见证矛盾，组合读面不能简单优先final掩盖；实际由runtime拒绝，纯summarize不承担来源查询。

装载只固定纯Schema/计算构件；撤除没有持久资源。规范资源缺失构建失败；坏数字/形状沿既有表示拒绝，来源不可取得由runtime unavailable，不能在纯包新增服务错误。Storage要求无。

迁移只更新当前CA4规范资源入口、必要类型引用/元数据、公开制品及双语README的来源责任说明；旧规范精确消费者不自动升级，旧实现兼容入口不增加。不修改有效费用/补账时间/精确数相加或工具账算法，不扩通用账务平台。

关键选择：在runtime同源前缀中选一次原事实，可验证来源完整性；若在pure summarize里自行加载日志就会增加存储/授权/生命周期且跨越本节点责任。保留纯构件的代价是组合验收必须真实覆盖witness→final、unknown迟到账及不同dispatch；这是已有CA3选择责任的窄接续。置信度高，独立评审待完成。

验收见verification A4-V1～V4；当前无新实现/实际证据，bindings保持0新增。
