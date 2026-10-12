# 工作区领域交接设计

状态：技术设计草案，未获整体技术接受。领域责任沿[已接受入口](README.md)；本页只拥有角色、事实归属与跨领域交接。

## 责任与协作

工作区维护逻辑身份、参与、实例与地址关联，并为获准消费者提供资源来源。完整长期行为草案位于 [workspace/workspace SPEC](../../../packages/workspace/workspace/SPEC.md)，正式叶包尚未成立。独立领域行为不依赖 Cordis 的业务含义；将来集成入口只承载真实依赖注入与生命周期，不把治理、授权或来源规则藏入内核。

| 事实拥有者 | 本次责任 | 交接与边界 |
| --- | --- | --- |
| 工作区治理 | 身份、托管治理归属、参与关系、按合法治理配置授撤的授权与关系有效性 | 消费身份与资源授权，不拥有登录或租户私有权利 |
| 实例与地址关联 | 指明实例属于哪个工作区、在哪个节点及有效入口；区分关联与实际可用性 | 环境拥有实际设施及资源寿命，不从路径造身份 |
| 工作区来源读取 | 根据明确候选选择、有效参与及实例条件和当前读取资格读取共享/local 及获准兼容来源，记录范围、版本与错误 | 读取不以装配完成为前提，也不代表已采用；资产拥有类别格式、资格求值和实现解析，Context 拥有目录指导 |
| 具体资源管理提供者 | 管理类型支持的读写、同步、冲突与实际效果证据 | 共同层不伪造底层能力，不统一跨地址合并或重做 Git |
| Session | 当前工作区选择、变更与逻辑工作身份 | 工作区返回合法关联，不替 Session 写选择历史 |
| 装配与交接 | 求值采用、必需依赖、候选校验及推进权交接 | 工作区不自行替换运行实例或迁移已发调用 |
| 执行环境与 Runtime Context | 实际落点、资源恢复事实；将真实变化供给 agent | 工作区关联不代表沙箱隔离、物理重建或原痕迹存在 |
| 人的交付面 | 收集明确选择，呈现目标、状态、失败与恢复入口 | 无权把排队显示为完成、把普通目录显示为有效附着 |

邻域采用范围只取存在的正式入口：[身份与授权](../identity-and-authorization/README.md)、[资产与规则](../assets-and-rules/README.md)、[Session 与工作](../sessions-and-work/README.md)、[装配与交接](../assembly-and-handoff/README.md)、[执行环境](../execution-environments/README.md)、[Runtime Context](../runtime-context/README.md)、[工具执行](../tool-execution/README.md)、[Skill](../skills/README.md)、[MCP](../mcp/README.md)和[Slash Command](../slash-commands/README.md)。
