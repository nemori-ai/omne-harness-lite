# 模型引用候选第二轮有限检查

2026-09-29，规范快照提交 `1254553fe008d85fe5f7cd1d0de2be3c10292d5f`。起草者执行、设计负责人逐一复核输入与原日志摘要后归档；不是独立运行验收，也不是采用。本轮与[首轮证据](../2026-09-29-formal-model-reference-candidate/README.md)分别保留。

| 检查 | 实际结果 | 原记录 |
|---|---|---|
| OpenedOrder 正配置 | exit 0，255 generated / 166 distinct | [日志](tlc-01-OpenedOrder.log)、[执行前输入与命令](tlc-01-OpenedOrder.json) |
| 四个 OpenedOrder 负控 | 各 exit 12；各自违反目标断言 | [命令、状态和断言](formal-runs.json)，相应 tlc-01 日志 |
| Schema 与规范实例 | 70/70 通过，含 Markdown 终结记录和超过 2^53 的整数 | [日志](schema-01.log)、[执行前输入](schema-01.json)、[原脚本](check_schemas.py) |
| 最终设计检查 | exit 0，internal / formal=registered | [日志](design-03.log)、[执行记录](design-03.json) |
| 最终文档检查 | exit 0，1844 Markdown 文件 | [日志](docs-03.log)、[执行记录](docs-03.json) |
| 冻结及首轮归档 | 852 旧冻结资源与首轮归档摘要未变 | [检查记录](integrity-check.json) |

所有新运行记录各有独立日志，保留执行前输入摘要；TLC 当次采集 Java 版本和 JAR 摘要。[归档输入](archived-inputs.json)逐项核对这些摘要并保存原输入。完整 118 项候选与三份登记资源见 [候选清单](candidate-files.json)，其 head 字段是起草时父提交，资源已进入上述精确提交。目录 inputs 中的 Markdown 以 .txt 封存，是只读运行输入，不是第二份设计权威。

ReferenceLifecycle/Publication 的 10 个模型与配置字节和首轮相同，本轮未重跑；[适用性清单](prior-model-applicability.json)给出逐项摘要。旧 OpenedOrder 结果不适用于新字节，已单独重跑。其它继承模型未重跑。

新增 OldAttemptMayOpen 检查 `ENABLED CommitOpened`：证明有限状态中旧 attempt 仍获允许，不证明公平性或一定发生。负控 RequireCurrentAttempt 使 NewAttempt→ReadPrefix 后该断言失败。三个有限模型均不代证真实授权、停止、网络、持久化、引用回收或 O(1) I/O。Schema 仅证明列举实例形状，不证明跨记录来源、转换关系与权限。

评审锁从 [snapshot01](semantic-snapshot-01.json)变为[snapshot02](semantic-snapshot-02.json)：起草者在第一次锁之后更改 MR10 一条性质汇总，设计负责人发现后明确重封；两位 reviewer 均核对 snapshot02。旧 MR10 正文由唯一行逆变恢复并核对原锁 SHA，见 snapshot-01-MR10-contract.md.txt；它不是运行时自动捕获文件。design/docs 01/02 是过程检查，输入记录保留，不冒称最终稿。

重跑时在上述提交检出，按原 JSON 命令调整本地工作树和输出目录。原 Schema 脚本硬编码本次工作树路径，迁移时仅替换 W；正式契约、Schema 与实例从固定提交取得。归档输入及日志只记录这次发生的事实，不因后续文档修订更新。
