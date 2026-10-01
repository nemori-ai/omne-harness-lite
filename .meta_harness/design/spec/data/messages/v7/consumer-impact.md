# data.messages/v7 消费者影响（candidate）

前驱：data.messages/v6，新坐标：data.messages/v7，baseline=omne-harness-lite-design-2026-09-15。所有旧规范/接受/冻结资源保持原字节。S-1～S-50保留编号，变更见下表；S-51～S-55为新增，全部尚待独立审查与采用。

| 原条款 | 新条款 | 改变与理由 |
|---|---|---|
| S-37/S-49/S-50 | 同号 + S-51～S-55 | CallKey/创建输入引用、两个marker、拒绝创建幂等关联；不是消息 |
| 原dispatched MP5 | 原样MP5；新created MP6 | 仅创建留原RT当前采用快照，未重解释旧发出字段；两版本shape相同仍各有精确来源 |

## 精确依赖图与实际直接消费者

本批有向消费为RT11→MR10/MS7/CA3，MR10→MS7/CA3，MS7→CA3；MR10与MS7保留MP5，MS7仅created另用MP6。其余精确依赖见registry/catalog.json本坐标，不建立反向MR/MS/CA环。SL3 S-10/S-11/S-32～S-37可承载新marker及opened，故不升SL4。

| 实际catalog消费者 | 原消费条款 | 处理 |
|---|---|---|
| data.model-response/v7 | S-9, S-10, S-21, S-31, S-49 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.loop-extension/v6 | S-1, S-9, S-15, S-27, S-31, S-37, S-39, S-49 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v7 | S-9, S-10, S-32, S-35, S-36, S-49, S-50 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.loop-extension-runner/v5 | S-3, S-15, S-18, S-22, S-26, S-32, S-49 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v8 | S-9, S-10, S-32, S-35, S-36, S-49, S-50 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v8 | S-9, S-10, S-21, S-31, S-49 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v9 | S-9, S-10, S-32, S-35, S-36, S-49, S-50 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v9 | S-9, S-10, S-21, S-31, S-49 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v10 | S-9, S-10, S-27, S-28, S-29, S-32, S-35, S-36, S-49, S-50 | 保持原采用；需明确迁移评审，不能自动升级 |

runtime v19及runner v8、core数据codec、Session日志codec、所有响应/消息写方、成本读面是实现影响检查对象；本稿不改变其采用状态或提供者设计。runtime需候选v20明确持久内容/索引/资格端口；runner只按采用范围传播，不能因ref读权限而得到anchored写入权；CA纯sum可复用，实际读面先选唯一来源。

lineage.json仅支持legacy baseline迁入，本批同baseline正常升版不伪造rebase；本表保存精确版本差异。id-namespaces复用既有S-/G-/CS-族，无新增全局族。公开技术名归RT11 S84～S94和MS7 S51～S55，不另立UL概念。

## R2 独立评审修订影响

S-9/S-50/S-54：response.reply是原模型证据，persisted唯一消息首次合法派生扩展；undispatched仅初次open拒绝带creationKey/payload，已accepted后的零发送终结两者缺席；Schema成对约束，跨记录来源仍需核。

由原消息+响应写方兑现合法扩展、权限、来源与unknown原批；上下文/计量消费者核原outputHistory及实际选入表示。本批只定关系，不建立通用映射DTO，不凭同形值授予写权。源版本与实际消费范围见 [source-alignment](source-alignment.md)，未扩未消费产品义务。
