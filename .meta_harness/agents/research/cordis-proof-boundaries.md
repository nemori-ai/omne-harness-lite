---
kind: research
id: R-cordis-proof-boundaries
scope: Cordis 形式结果的组件义务及本项目治理推论
---

# Cordis 形式结果与组件责任

2026-09-14 核对 [A Programming Paradigm for Spatiotemporal Composability，v1](https://arxiv.org/pdf/2608.25512v1)。
这是论文版本，不是本项目依赖包版本。官方 API 的研究修订仍固定为 DSH
`c291e7961a515f6d7af9304e7fd1d257929aef26`；本项目当前 agent 包声明采用官方
Cordis `4.0.2`，三者不混为同一实现依据。

## 可核对的观察

| 来源 | 所支持的事实 |
|---|---|
| 论文 §5.1.1，页 59 | 运行时不检查组件所附逆操作的正确性；服务键上操作的交换性见证也由提供组件负责 |
| 论文 §3.4.2，页 28–30 | 操作独立性涉及前向、逆操作及结果；表示方式和接口观察决定交换条件，条目独立注册与有序链条不能借用同一结论 |
| 论文 §6.1，页 70–71 | 受控范围按具体位置的访问和恢复能力判断；资源获取与外部输出不同，补偿的应用等价关系需另行论证组合条件 |
| [固定修订的 Fiber 文档](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/fiber.md) | effect 登记及调用清理的 API 语义，不能据此证明任意回调正确 |

已有[装载清理来源](design-spec-maintenance/effect-cleanup-sources.md)和
[实现映射](../architecture-guide/reference/cordis-mapping.md)保留具体机制及采用范围。
本次没有运行 Cordis 发行物实验、插件契约测试、故障注入或证明工具。

## 项目推论与局限

[本轮提案](../proposals/evidence-governance/README.md)据用户要求，将关键性质的
前提、责任方和证据连接到提案接受、精确规格与交付计划。证明门槛、机器检查
触发和任务阻塞方式是项目治理选择，不是论文规定的开发流程。

论文的结论不直接证明项目的实现、租户授权、持久恢复或生成插件安全。引用有效
证明需要核对命题和前提，实际包及具体提供者还需实现符合性证据。共享资源的
撤除示例仅用于说明这种义务，不接受任何具体产品的注册、迁移或补偿协议。
