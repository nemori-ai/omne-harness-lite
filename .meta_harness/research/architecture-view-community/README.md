# 架构视图的社区先例与布局边界

本次调查区分图的表达、交互和布局算法。它接续负责人对 N2 视图的调查要求，
不重复[架构判断辅助](../architecture-judgment-aids/README.md)中的事实抽取器选型。

- 对象：C4、Structurizr、dependency-cruiser、ELK、NDepend 和 Lattix 的官方资料。
- 基线：2026-10-03 读取的页面；dependency-cruiser v18.5.0，elkjs 0.12.0。
- 消费者：[N2 工具视图的采用记录](../../../tools/ts-checks/src/arch/ADR.md)。
- 最近核对：2026-10-03。小型 ELK 和离线浏览器探针已执行，未跑完整基准。

| 问题 | 入口 |
| --- | --- |
| 这些先例支持什么，代价是什么 | [研究正文](research.md) |
| 精确来源、实际探针和局限 | [证据记录](evidence.md) |

官方说明与本机观察分别记录。图的可读性仍需负责人实际使用，不能由布局成功代签。
