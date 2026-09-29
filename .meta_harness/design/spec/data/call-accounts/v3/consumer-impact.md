# data.call-accounts/v3 消费者影响（candidate）

前驱：data.call-accounts/v2，新坐标：data.call-accounts/v3，baseline=omne-harness-lite-design-2026-09-15。所有旧规范/接受/冻结资源保持原字节。S-1～S-39保留编号，变更见下表；S-40～S-42为新增，全部尚待独立审查与采用。

| 原条款 | 新条款 | 改变与理由 |
|---|---|---|
| S-10/S-16/S-17/S-19/S-22/S-23/S-25/S-39 | 同号 + S-40～S-42 | ready/final同ResponseId只选一份原账，final接替，补账目标及原归属不变；纯sum签名可保持 |

## 精确依赖图与实际直接消费者

本批有向消费为RT11→MR10/MS7/CA3，MR10→MS7/CA3，MS7→CA3；MR10与MS7保留MP5，MS7仅created另用MP6。其余精确依赖见registry/catalog.json本坐标，不建立反向MR/MS/CA环。SL3 S-10/S-11/S-32～S-37可承载新marker及opened，故不升SL4。

| 实际catalog消费者 | 原消费条款 | 处理 |
|---|---|---|
| data.model-response/v2 | S-6, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.loop-extension/v2 | S-6, S-8, S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.messages/v2 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.arrival-events/v2 | S-4, S-6, S-8, S-11, S-15, S-19, S-20, S-21, S-27, S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.stream-assembly/v2 | S-4, S-11, S-15, S-19, S-20, S-21, S-27 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.asset-registry/v2 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.loop-extension-runner/v2 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v2 | S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.tool-execution-runtime/v2 | S-9, S-10, S-11, S-14, S-17, S-18, S-20, S-21, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.session-log/v2 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.run-attempt-facts/v2 | S-37, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v3 | S-6, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.loop-extension/v3 | S-6, S-8, S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.messages/v3 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.stream-assembly/v3 | S-4, S-11, S-15, S-19, S-20, S-21, S-27 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.messages/v4 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v4 | S-6, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39, S-4 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.asset-registry/v3 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v3 | S-6, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.loop-extension/v4 | S-6, S-8, S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.loop-extension-runner/v3 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.asset-registry/v4 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.session-log/v3 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v4 | S-6, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v5 | S-6, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39, S-4 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v5 | S-6, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.messages/v5 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v6 | S-6, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39, S-4 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v6 | S-6, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.loop-extension/v5 | S-6, S-8, S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.loop-extension-runner/v4 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.messages/v6 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v7 | S-6, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39, S-4 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.loop-extension/v6 | S-6, S-8, S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v7 | S-6, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.loop-extension-runner/v5 | S-37 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v8 | S-6, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v8 | S-6, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39, S-4 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v9 | S-6, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| data.model-response/v9 | S-4, S-6, S-7, S-8, S-15, S-17, S-22, S-23, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |
| capability.model-request-runtime/v10 | S-6, S-7, S-8, S-15, S-19, S-20, S-25, S-37, S-38, S-39 | 保持原采用；需明确迁移评审，不能自动升级 |

runtime v19及runner v8、core数据codec、Session日志codec、所有响应/消息写方、成本读面是实现影响检查对象；本稿不改变其采用状态或提供者设计。runtime需候选v20明确持久内容/索引/资格端口；runner只按采用范围传播，不能因ref读权限而得到anchored写入权；CA纯sum可复用，实际读面先选唯一来源。

lineage.json仅支持legacy baseline迁入，本批同baseline正常升版不伪造rebase；本表保存精确版本差异。id-namespaces复用既有S-/G-/CS-族，无新增全局族。公开技术名归RT11 S84～S94和MS7 S51～S55，不另立UL概念。
