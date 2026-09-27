# CLI/TUI 设计投影

## 2026-09-27 工作区产品修订的影响

现有版本是各自来源修订的冻结快照，不覆盖本轮工作区产品增量。已核对的身份、资产清单与兼容 hook 交接差异，以及无需改写的 reload／治理边界，见下方影响核对；新的工作区接入仍待契约与节点设计，不能通过更新旧 provenance 摘要声称投影已对齐。

[核对依据与消费者边界](../../../../research/workspace-product-technical-impact/research.md)。本次只更新适用范围与缺口，不改冻结规范、既有采用或历史验证，也不展开 PF-020 技术设计。

投影是按版本固化的实施阅读面，不替代产品、契约、采用决定或实现映射。

| 版本 | 范围与局限 |
|---|---|
| [v1](v1/projection.md) | PF-016 rev6 的首个无秘密公开health传输增量；节点独立评审后生成。其余CLI/TUI仍有明确gap，不是全量闭环投影 |

[v2共享治理客户端与交互输入](v2/projection.md)：PF016 rev7，D048节点审查后固化；CLI/TUI应用仍待采用。

[v3受保护文件CLI](v3/projection.md)：D049应用增量，TTY/TUI和安装仍未完成。

[v4可搬运CLI](v4/projection.md)：D050归档及独立中心进程验证，TUI/备份仍未完成。

[v5 iTerm提供路径](v5/projection.md)：D054 R2采用快照，实际产品验证待完成。
