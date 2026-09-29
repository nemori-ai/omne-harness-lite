# capability.model-request-runtime/v11 消费者影响（candidate）

前驱：capability.model-request-runtime/v10，新坐标：capability.model-request-runtime/v11，baseline=omne-harness-lite-design-2026-09-15。所有旧规范/接受/冻结资源保持原字节。S-1～S-83保留编号，变更见下表；S-84～S-94为新增，全部尚待独立审查与采用。

| 原条款 | 新条款 | 改变与理由 |
|---|---|---|
| S-5/S-6/S-7/S-28 | 同号 + S-84/S-85 | 创建先持久再公布身份，creationKey同键认回，执行owner与消费者分离 |
| S-14/S-23/S-24～S-34/S-49/S-50 | 同号 + S-87/S-89/S-90/S-92 | 原13操作九项同步，第14操作acquire；creationConflict封闭失败与当前四类资格 |
| S-8/S-15/S-16/S-68 | 同号 + S-88 | 旧opened unfenced+tailEquals，新dispatch仍fenced |
| S-17/S-31/S-33/S-36/S-49/S-75/S-81 | 同号 + S-86 | ready使调用终态，处分另定；unknown原批/真实停止/部分结果不丢 |
| S-38/S-40 | 同号 + S-91/S-93 | 当前派生查询、跨提交/回收责任与有限模型 |

## 精确依赖图与实际直接消费者

本批有向消费为RT11→MR10/MS7/CA3，MR10→MS7/CA3，MS7→CA3；MR10与MS7保留MP5，MS7仅created另用MP6。其余精确依赖见registry/catalog.json本坐标，不建立反向MR/MS/CA环。SL3 S-10/S-11/S-32～S-37可承载新marker及opened，故不升SL4。

| 实际catalog消费者 | 原消费条款 | 处理 |
|---|---|---|
| 无精确直连条目 | — | 不能由此断言无实现消费者 |

runtime v19及runner v8、core数据codec、Session日志codec、所有响应/消息写方、成本读面是实现影响检查对象；本稿不改变其采用状态或提供者设计。runtime需候选v20明确持久内容/索引/资格端口；runner只按采用范围传播，不能因ref读权限而得到anchored写入权；CA纯sum可复用，实际读面先选唯一来源。

lineage.json仅支持legacy baseline迁入，本批同baseline正常升版不伪造rebase；本表保存精确版本差异。id-namespaces复用既有S-/G-/CS-族，无新增全局族。公开技术名归RT11 S84～S94和MS7 S51～S55，不另立UL概念。
