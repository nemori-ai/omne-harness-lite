# 模型引用候选的有限形式与 Schema 检查

2026-09-29，候选规格提交 `3f597c18`，父提交 `4edf6cdc`。本次是起草者执行、设计负责人逐文件回读后归档的证据；不是独立实现验收，不构成采用决定。对应 [模型引用提案](../../proposals/model-runtime-reference-lifecycle/README.md) 与 RT11/MR10/MS7/CA3 候选。

## 实际结果

| 检查 | 结果与范围 | 原始记录 |
|---|---|---|
| ReferenceLifecycle | exit 0；621 distinct states，无反例 | [原输出](outputs/ReferenceLifecycle.log) |
| Publication | exit 0；60 distinct states，无反例 | [原输出](outputs/Publication.log) |
| OpenedOrder | exit 0；166 distinct states，无反例 | [原输出](outputs/OpenedOrder.log) |
| 九项保护条件负控 | 每项 exit 12，均违反配置对应不变量；不是成功的规范任务 | [命令、退出码和对应不变量](formal-runs.json)，原始输出在 `outputs/` |
| 三份 Schema 与五份实例集 | 57/57 形状案例与预期一致；包含大于 2^53 的整数 | [原输出](schema-check.log)、[实际检查脚本](check_schemas.py) |
| 设计链登记 | exit 0；formal 仅 registered，此检查不执行 TLC | [原输出](design-check-locked.log) |
| 文档链接 | exit 0；1836 Markdown 文件 | [原输出](docs-check.log) |
| 冻结完整性 | 852 个旧冻结资源未变，冻结清单未改；113 个候选资源，193 条 reviewed:false 覆盖 | [检查结果](integrity-check.json) |

TLC 实际日志各自含运行版本。Java 版本、工具 JAR 摘要及 15 个模型/配置的摘要在 [交付时清单](formal-inputs-delivery.json)。**运行当刻没有单独采集输入摘要或 Java 版本**；起草者确认模型和配置在本次运行后未修改，归档负责人逐一重新计算交付摘要并与清单一致。该清单是交付时采集，不冒充执行前快照。原始命令、退出码与日志摘要在 [formal-runs.json](formal-runs.json)。目录 `inputs/` 保留这 15 个输入及实际三份 Schema、五份实例集；49 份 Schema 注册资源的交付摘要在 [schema-resources-delivery.json](schema-resources-delivery.json)，完整依赖可从上述提交恢复。

七份受审契约/Schema 的锁定摘要见 [semantic-snapshot.json](semantic-snapshot.json)，全部候选规范资源见 [candidate-files.json](candidate-files.json)。模型执行与随后独立设计评审是不同事件，后续修改须另记录适用性或新 run，不能覆写这里的结果。

## 模型边界

- ReferenceLifecycle 为单调用、两个消费者、两代登记的有限状态模型，检查消费者释放不取消、终态不被旧投影重新打开、ready/final 不重复记账及精确代际清理。真实授权、观察任务的物理停止和模型网络不在其中。
- Publication 区分内容存在、保留、可能写者、marker 提交、回执认回与最终处分。创建身份和 payload 在该模型中固定为符号常量，**不据此证明**真实 creationKey 冲突判断、SHA-256 字节保持、JSON 数字保真或任意存储协议。
- OpenedOrder 检查有限日志尾比较、取消/首内容顺序和首内容后失联禁止重发；完整日志有效性、实际 writer 静止与生产恢复权不是模型生成的事实。
- 三个正配置均是安全性检查，没有公平性假设，也未检查活性。单发送硬门不构成真实 HTTP 恰好一次证明。所有旧继承模型本轮未运行；继承旧模型不自动覆盖新终态/处分协议。
- Schema 检查不覆盖跨记录同源、精确关系判断、原子提交、权限、摘要对应、网络、硬进程崩溃、内容回收或 O(1) I/O。`parse_float=Decimal` 与 Python 原生整数避免检查器自身舍入，但不证明未来 TypeScript 实现保真。

## 原失败的保留限制

起草过程中存在一次早期 Schema 运行的两项失败。该运行日志被最终成功运行覆盖，当时脚本和实例未单独快照；**原始失败日志未保留，旧输入不能完整恢复**。下列仅是起草者从会话工具输出交付的摘录说明，不是重建的原日志：

1. `examples.json / pending-complete-required-evidence` 被检查器误用根 ModelResponse 校验，报缺 `replyDisposition`；当时脚本未读取实例的 `schemaDefinition: PendingModelResponse`。修正选择入口。
2. `ready-examples.json / actual-large-exact-count` 的 Usage.source 错填 `upstream_usage`，规范枚举为 `upstream | none`。修正实例。

最终 57/57 是已保留日志与交付输入的结果，不能用它抹去上述证据缺损。此处如实记录局限，不声称早期失败已得到完整可重跑归档。

## 重跑与接受

在提交 `3f597c18` 的检出中，按 `formal-runs.json` 调用 TLC；其中原绝对检出路径和 metadir 是此次运行实参，换检出重跑时仅调整本地路径和输出目录，保留模型/配置字节。Schema 脚本同样记录了原检出路径；复用时调整脚本的 W 到目标检出并将改后脚本作为**新运行输入**保存。使用该检出的锁定 Python 工具环境执行。

本轮不证明实际 Cordis 提供者、Session 日志、存储保留、授权、取消、恢复、性能或模型供应商交付。候选接受及后续实现门均由主线另行处理。
