# 本批 DSH 复用边界

[D-006](../decisions/D-006-dsh-core-adoption.md) 已确定本批源码来源与设计门槛，
完整逐包范围由[采用集合](../proposals/dsh-core-adoption/selection.md)拥有。
这批工作涵盖内核原语、产品能力和具体后端；“核心产品能力”不等同于全部进入内核。

| 责任 | 选定主体来源 | 当前状态 |
|---|---|---|
| 作用域与活体实例原语 | `dsh-scope`、`dsh-agent` | live-agent v1 已接受；已有 agent 定向源基线，完整目标实现及公共 scope 设计待完成 |
| 会话事实、状态与存储 | `dsh-session`、`dsh-session-projection`、`dsh-session-persistence`、`dsh-session-persistence-jsonl` | 来源已选；会话/存储精确契约与具体 JSONL 后端设计待完成 |
| 工作驱动与上下文装配 | `dsh-agent-loop`、`dsh-system-prompt` | 来源已选；Run 控制、输入队列、装配和恢复组合待完成 |
| 工具定义与执行 | `dsh-tools` | 来源已选；[现有工具草案](../proposals/tool-system/README.md)仍为候选，必须形成新架构并接受 |
| 模型服务与请求 | `dsh-llm` | 来源已选；必须完成新模型架构及统一 OpenRouter 提供者设计 |

另限定复用 brand、util-values、timeout、attachment 的必要支撑源码；它们不是
四个完整子系统的采用决定，也不预定目标包数量。

## Cordis 组合与状态归属

Cordis Context 提供服务解析与受管贡献；scope 管理可见性和事件路由；agent 管理
活体占用与生命周期。长期 Session、运行状态、单次工具工作及模型请求分别由
对应能力拥有，使用共同身份与数据契约，通过插件、服务、依赖和类型化事件组合。

租户与当前权限在实际跨边界操作中校验。Context 可见、服务已注入、携带 Session
标识，都不构成操作授权；运行时消失也不等于外部工作已经停止。

模型面对的内容由上下文装配产生，调用上下文携带该次操作的必要事实，可变会话
状态按所属契约持有或从日志投影。三者不合成一个任意可变的 runtime context。
共享消息/媒体契约不由 LLM 运行时反向拥有，存储后端也不因上游 helper 导入依赖模型能力。

## 接下来的设计

[阶段计划](../proposals/dsh-core-adoption/design-plan.md)先明确共享契约与内核映射，
然后在必需接口接受后并行展开 Session、工具和模型设计，再定稿 Loop/控制/装配
组合。每个专题分别完成设计评审、接受、来源基线、导入计划和实现验收。

工具专题重点覆盖多命令单槽位、必需 skill、精确绑定、独立调用与后台、过程帧、
HITL 和恢复；模型专题重点覆盖所有用途的 OpenRouter 出口、当前资格与预算、
动态切换、多模态与流式交付、真实费用和失败边界。

本批没有采用完整 presets、jobs、批准应用、旧格式迁移、模型直连适配器或环境
工具包；这些来源的排除不撤回相应产品要求。首个真实闭环仍需要受权输入、
OpenRouter 实际调用、真实工具与持久恢复等完整组合证据。

本次需求覆盖、尚缺能力与基线可复查范围见[消费记录](../proposals/dsh-core-adoption/requirements.md)。
当前已接受业务契约继续从 [spec/catalog.json](../../spec/catalog.json) 查找；本次来源
选择没有发布新的数据或行为规格。
