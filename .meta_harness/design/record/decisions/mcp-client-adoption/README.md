# D-037：MCP 客户端的采用——官方 SDK 上自写薄桥，本版桥接范围与 stdio 落点

产品负责人 2026-09-23 裁定：[MCP](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-mcp--mcp--mcp) 客户端这一层
**以官方 `@modelcontextprotocol/sdk` 为协议层、本项目自写薄桥**（提案候选 C）；
同行封装（DSH、pi 生态、LangChain 等）只作借鉴避坑；本版桥接范围按复选卡片逐项拍定；
stdio 服务端**本版一律由据点进程在据点机拉起**，「可换落点」记为将来的拓展点。
**接受的是实现路径、桥接范围与落点取值，不是 MCP 桥接契约、连接池设计或任何实现**——三者都还没有。

- **输入与下游**：来源提案 [`proposals/mcp-client-adoption`](../../proposals/mcp-client-adoption/README.md)（四个候选，作者推荐 C）；
  研究 [mcp-client-reuse](../../../../research/mcp-client-reuse/README.md) 三轮（首轮两源对象模型；第二轮同行封装与依赖；第三轮 stdio 拉起位置）。
  下游是块 B 的 MCP 桥接契约与提供者节点（**未起草**）、工具定义契约（[D-031](../tool-definition-baseline/README.md)）里 MCP 动作条目的共用面。
- **范围定位**：只解决「协议层从哪来、本版桥到哪一步、stdio 在哪拉起」。
  **不解决**：连接与 stdio 子进程的宿主归谁（架构）；从未连上过的接入点没有「上一次清单」怎么办（产品）；接入点凭据的词条（统一语言）；OAuth 带出的三件产品面事项（见正文）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-23 分三步：对提案原话**「C + 看 dsh、pi、langchain 等它们自己额外封装的东西里面，有没有哪些是我们可以借鉴的（同样是以避免踩坑、少走弯路为目的，以及它们用的额外的技术栈或者依赖）」**；桥接范围以复选卡片拍定（勾选四项，见正文）；stdio 落点在第三轮研究后原话**「本版一律在据点机拉起、把『可换落点』记为将来的拓展点」**。逐字摘自当日裁决台账（主检出 `tmp/assets-runtimes/g1-rulings.md` 第 3、3a、3b 行） |
| 精确修订 | 提案包在 HUB 分支 `panqiwei/assets-runtimes` 提交 `b12d927` 的内容；研究第二、三轮在 `9ab1e36`、`1ed9e62` |
| 接受范围 | C 路径；桥接范围表；stdio 落点取值；逐项见[决定正文](decision.md#选择与范围) |
| 保留前提 | SDK 发布包的能力**未取证**（协议版本已核：1.29.0/1.30.0 到 2025-11-25）；同行借鉴只为避坑；OAuth 的桥接以产品面三事项闭合为前提；见[正文](decision.md#理由与保留前提) |
| 评审状态 | 提案[未记录任何独立评审](../../proposals/mcp-client-adoption/review.md)；接受不以评审为前提 |
| 取代关系 | 不取代任何决定；使提案候选假设 N-11 **不成立为本版性质** |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 接受了什么、为什么、**不表示**什么 | [决定正文](decision.md) |
| 四个候选、「支持到哪一步」的作者建议表 | [提案候选与取舍](../../proposals/mcp-client-adoption/alternatives.md) |
| 同行踩过的坑与额外依赖 | [研究第二轮](../../../../research/mcp-client-reuse/research.md#第二轮同行封装的借鉴与依赖) |
| 同行 stdio 在哪拉起、两种取值各撞什么 | [研究第三轮](../../../../research/mcp-client-reuse/research.md#第三轮stdio-拉起位置) |

返回[决定](../README.md)。
