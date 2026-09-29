# data.model-response/v10 消费者影响（candidate）

前驱：data.model-response/v9，新坐标：data.model-response/v10，baseline=omne-harness-lite-design-2026-09-15。所有旧规范/接受/冻结资源保持原字节。S-1～S-45保留编号，变更见下表；S-46～S-48为新增，全部尚待独立审查与采用。

| 原条款 | 新条款 | 改变与理由 |
|---|---|---|
| S-26/S-39 | 同号 + S-46 | 允许Pending作为不可变内容保存，根final形状不放宽 |
| S-14/S-19/S-22 | 同号 + S-47/S-48 | ready/final原事实相等；仅处分/late新增，原账不重复 |

## 精确依赖图与实际直接消费者

本批有向消费为RT11→MR10/MS7/CA3，MR10→MS7/CA3，MS7→CA3；MR10与MS7保留MP5，MS7仅created另用MP6。其余精确依赖见registry/catalog.json本坐标，不建立反向MR/MS/CA环。SL3 S-10/S-11/S-32～S-37可承载新marker及opened，故不升SL4。

| 实际catalog消费者 | 原消费条款 | 处理 |
|---|---|---|
| capability.model-request-runtime/v10 | S-3, S-4, S-5, S-6, S-7, S-8, S-9, S-10, S-11, S-12, S-13, S-14, S-15, S-16, S-17, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-35, S-36, S-37, S-38, S-39, S-40, S-41, S-42, S-43, S-44, S-45 | 保持原采用；需明确迁移评审，不能自动升级 |

runtime v19及runner v8、core数据codec、Session日志codec、所有响应/消息写方、成本读面是实现影响检查对象；本稿不改变其采用状态或提供者设计。runtime需候选v20明确持久内容/索引/资格端口；runner只按采用范围传播，不能因ref读权限而得到anchored写入权；CA纯sum可复用，实际读面先选唯一来源。

lineage.json仅支持legacy baseline迁入，本批同baseline正常升版不伪造rebase；本表保存精确版本差异。id-namespaces复用既有S-/G-/CS-族，无新增全局族。公开技术名归RT11 S84～S94和MS7 S51～S55，不另立UL概念。
