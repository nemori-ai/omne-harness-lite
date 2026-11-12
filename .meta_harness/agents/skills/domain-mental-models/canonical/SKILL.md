---
name: domain-mental-models
description: "本项目各领域的心智模型与跨领域协调的模型：每个领域是什么、不是什么、拿它怎样量一个设计。在 Session、Agent、Model、Tool、Context、接入层等任何一个领域里做设计或实现时加载；改动会波及别的领域、要判断一件事归谁、两个领域之间该怎样来往、生命周期与卸载怎样处理、要新增一个领域时也加载，任务里没有出现「心智模型」这个词也一样。只查一个已知事实、纯工具链或纯文档排版的改动不加载。"
---

# 各领域的心智模型

根 `AGENTS.md` 的两张图和「心智模型要点」是每个 agent 始终要懂的。这份技能是它们的展开：你在某个领域里干活，或你的改动碰到了别的领域时，读对应的那一份。

每一份回答同样的三个问题：

1. 它是什么。
2. 它不是什么。
3. 拿它怎样量一个设计。

## 读哪一份

先读跨领域那一份里和这次改动有关的一节，再读你所在领域的那一份。改动碰到别的领域时，读那个领域的那一份。读到能回答上面三问就停，不用全读。

| 你在做的事 | 读 |
| --- | --- |
| 两个领域之间该怎样来往；一方要不要等另一方、替另一方取消 | [references/cross-domain.md](references/cross-domain.md)「调用是远程调用」 |
| 一件事该归 Session 还是归 Agent | [references/cross-domain.md](references/cross-domain.md)「Run 是边界」 |
| 一个领域要知道另一个领域的事实，或要问许不许 | [references/cross-domain.md](references/cross-domain.md)「知道与决定」，再读 [references/runtime-context.md](references/runtime-context.md) |
| 谁可以认识谁；端口归谁；要不要一个适配成员 | [references/cross-domain.md](references/cross-domain.md)「谁认识谁」 |
| 新增一个领域，或判断一个领域还缺什么 | [references/cross-domain.md](references/cross-domain.md)「一个完整的领域提供什么」 |
| 装上、卸下、替换；在途的工作怎样处置；Cordis 该做什么 | [references/cross-domain.md](references/cross-domain.md)「动态性与 Cordis」 |
| 在会话这个领域里：输入、Run、生命周期、会话日志 | [references/session.md](references/session.md) |
| 在 Agent 这个领域里：循环、拓展点、对 Model 和 Tool 的调用 | [references/agent.md](references/agent.md) |
| 发布或读取运行数据 | [references/runtime-context.md](references/runtime-context.md) |
| 领域怎样对客户端开放；入口、协议、接入插件、界面模块 | [references/access.md](references/access.md) |

还没有写的领域：身份、授权、权限；Model 与 Tool 作为被调用的一方；Request Context；执行环境；人工介入；资产；工作区。碰到它们时读根 `AGENTS.md` 的两张图和跨领域那一份，再读那个领域的正文（`docs/domains/` 下它的目录）。

## 这些文字的地位

它们是解释，不是任何事实的唯一源。精确的规则归各自的拥有者正文，每一份的末尾写了出处。出处写的是执行仓库根下的路径。

心智模型和拥有者正文不一致时，以正文为准，并报告这处不一致。不要拿心智模型去改写一条已经接受的规则。

## 维护

- 新增一个领域的心智模型：在 `references/` 加一份，三问都答，末尾写出处；在上表加一行；从「还没有写的领域」里去掉它。
- 一个领域的边界变了：先改拥有者正文，再改它的这一份。
- 根 `AGENTS.md`「心智模型要点」是这里最影响行为的几条的精简版。这里的一条变了，核对那一节要不要跟着改。
- 每一份保持短。它要回答的是「怎样看这个领域」，不是这个领域的规格。
