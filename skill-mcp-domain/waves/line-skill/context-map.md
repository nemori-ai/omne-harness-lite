# 线级上下文地图：Skill（无卡，负责人会话内要求）

格式沿 `claim` 技能 `references/context-map.md`。路径相对父工作树根 `/home/user/omne-harness-lite/.worktrees/skill-mcp`（闭包工作树同布局）。

## 不变量

- 对无权主体，「无权」与「身份不存在」不可区分。来源：`packages/skills/docs/architecture.md`「失败种类」`not-available-to-you` 一行；要求 SYS-TENANT。
- 读取每次现场核验，先 `SkillReadCheck`，再 `SkillResolution`；不缓存读取权。来源：同页「读取」第 2、3 步。
- 不交拼接的版本：带材料依据的各页对同一快照摘要核对；字节按条目摘要核对，不符报 `version-changed`。来源：同页「读取」第 7、10 步。
- `SkillRef` 与包定位从不交给调用方。来源：同页「模型」`SkillRef` 一行、「读取」末段。
- Skill 不判定依赖可用性，不交设置值，不执行脚本。来源：同页「边界·不知道谁」、Q-SK04、Q-SK08。

## 系统地图

- `docs/orientation.md`：仓库定向页。本项固定，不删。
- `docs/domains/skills/README.md`、`architecture.md`：领域责任与端口实现方。

## 先读什么，读到哪停

1. `docs/orientation.md`：读到能找到 Skill 领域的拥有者为止。
2. `packages/skills/README.md`：全文（成员与依赖）。
3. `packages/skills/docs/architecture.md:1-466`：设计守则、边界、模型、端口、应用服务、读取、失败种类、SOLID、独立消费者需求、验证。停在「技术后续设计与承接缺项」之前；Q-SK02–Q-SK06 只在规格引用时读。
4. `tmp/skill-mcp-domain/model/README.md` 的「Skill 上下文」「建模发现」两节，以及 `model/skill/*.ts`：形状与参考实现的起点。
5. `packages/assets/assets/src/identity.ts`：`BodyContract`、`CapabilityId`、`JudgeContext`、`Declarations` 的真实形状。
6. `packages/skills/skill-contract/src/contract.ts`：现有 `skillBodyContract`。

不要读：`packages.0.0.1.legacy/`（旧材料只经组页「包格式规则」筛选后的结论进入）；其他领域的实现。

## 本线最容易踩的耦合

- 让「依赖可用性」或「脚本设施」进入读取结果（已被负责人否决）。
- 把资产治理（持有、层序、配值）建进 Skill 的模型；来源层只搬运不解释。
- 让 `SkillMaterialBasis` 带包定位，或把 `SkillRef` 暴露在公开根。
- 在契约里点名任何调用方（会话、Agent、工具）。

## 相邻线的接口

| 相邻线 | 它提供什么 | 它需要本线提供什么 |
| --- | --- | --- |
| MCP 线 | 无 | 无。两线互不依赖 |
| assets（不在本会话） | `BodyContract` 等公开类型（已存在） | `skillBodyContract` 登记 `skill` 类别 |

## 本线加载

- 执行角色：`developer`，`implementation_kind: product`。
- 三层技能：流程 `pstack:poteto-mode`；写法 Matt `to-spec`、`to-tickets`（reduce 用）、`writing-for-agents`；品味 `ub-mode`。写 `.ts` 时 `pstack:typescript-best-practices`；写文档时 `asd-ste100`。
- 共用约束：[constraints.md](../constraints.md)。
