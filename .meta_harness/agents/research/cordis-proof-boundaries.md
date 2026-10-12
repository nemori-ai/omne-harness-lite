---
kind: research
id: R-cordis-proof-boundaries
scope: Cordis 形式结果的组件义务及本项目治理推论
---

# Cordis 形式结果与组件责任

事实范围是 [A Programming Paradigm for Spatiotemporal Composability，v1](https://arxiv.org/pdf/2608.25512v1)
及固定 DSH 修订 `c291e7961a515f6d7af9304e7fd1d257929aef26` 的文档。
论文版本、源码文档修订和项目实际采用的 Cordis 发行物是不同依据，不能互相替代。

## 可核对的观察

| 来源 | 所支持的事实 |
|---|---|
| 论文 §5.1.1，页 59 | 运行时不检查组件所附逆操作的正确性；服务键上操作的交换性见证也由提供组件负责 |
| 论文 §3.4.2，页 28–30 | 操作独立性涉及前向、逆操作及结果；表示方式和接口观察决定交换条件，条目独立注册与有序链条不能借用同一结论 |
| 论文 §6.1，页 70–71 | 受控范围按具体位置的访问和恢复能力判断；资源获取与外部输出不同，补偿的应用等价关系需另行论证组合条件 |
| [固定修订的 Fiber 文档](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/fiber.md) | effect 登记及调用清理的 API 语义，不能据此证明任意回调正确 |

具体清理 API 事实见[装载清理来源](design-spec-maintenance/effect-cleanup-sources.md)。
当前设计核对方法归 执行仓库的[组合性质与证明义务](../../../docs/verification.md#组合性质与证明义务)。

## 适用边界

论文的结论不直接证明项目的实现、租户授权、持久恢复或生成插件安全。引用有效
证明需要核对命题和前提，实际包及具体提供者还需实现符合性证据。共享资源的
撤除示例仅用于说明这种义务，不接受任何具体产品的注册、迁移或补偿协议。
