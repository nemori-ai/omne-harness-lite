# 系统提示词提案

最新附件：[SystemPromptProfile 完整 Schema 草案](system-prompt-profile.schema.json)、
[字段与语义说明](system-prompt-profile.schema-notes.md)、[完整实例](system-prompt-profile.example.json)。
附件供 review，不恢复下述已撤回的领域模型。

## 用户已明确的要求

系统提示词需要独立创建、管理、发布，并被多个 Agent 引用。这为独立的
SystemPromptProfile 聚合提供了明确依据；不再假设它只能附属于 Agent Definition。

系统提示词包含两部分：

- **静态部分**：固定纯文本。同一内容版本在任意时刻加载均为相同内容，不插值、
  不读取上下文、不因 Agent 或会话状态变化而改变。
- **动态部分**：用户可定义的模板，使用受限域内的上下文状态变量（context state variant）。
  模板与允许引用的状态范围属于定义；具体状态值与渲染结果属于某次运行。

动态绑定的 `state_key` 必须从系统控制的限定集合中选择，不能由档案填写者自行发明或注册。
可以自定义的是模板及其局部变量别名；键对应的值由运行上下文供应。
限定集合不要求全系统固定 enum；按 Cordis 的生命周期思路，由获准提供者声明和注册，
运行时可用集合随作用域及装配变化。具体契约、依赖和移除规则见 [Schema 说明](system-prompt-profile.schema-notes.md)。

渲染由后续业务逻辑提供，例如通过 hook 或 Cordis 插件在 session run start 时触发。
此处是可能的触发点示例，不是已经限定只能在该时刻渲染，也没有要求每 Step 重渲染。
具体模板语法、状态变量范围、触发协议与生效边界待后续讨论。以下未被明确确认的机制仍是提案。

## 模型导航与边界

| 模型 | 拥有的语义 |
|---|---|
| `SystemPromptProfile@2`（模型定义已撤回） | 租户归属、发布 revision、退休与稳定指导 |
| `PromptSection@2`（模型定义已撤回） | 可排序、可严格插值的模板值 |
| `PromptContribution@1`（模型定义已撤回） | 插件来源、作用域、通道、工具依赖 |
| `RequestSnapshot@1`（模型定义已撤回） | 实际请求的提示、消息、模型、工具和来源证据 |

无需另设可编辑 PromptAssembly 聚合或 PromptSnapshot / ResolvedPrompt 平行结构：
assembly 是领域操作，结果由同一个 RequestSnapshot 承载。压缩摘要属于 Session 历史投影，
不回写 Profile；工具输入 Schema 由 ComponentProfile 拥有；变量绑定来自明确 owner 的受控事实视图。

## 组装契约

`Assemble(profile revision, scope, history cursor, model binding, effective tools,
composition generation, contributions) → RequestSnapshot | Rejected(reason)`。

动态渲染在业务契约指定的触发点执行；模型请求可组装并使用已有渲染结果，
不能将“每次请求组装”自动等同于“动态模板每次重新求值”。依次验证租户引用与 Profile 发布状态、解析贡献与变量、
根据最终有效工具集筛选相关指导、确定排序、渲染文本、验证输入视图代际一致、留存准备后的请求证据。
重复 section_key、未绑定变量、失效的必需工具、代际混杂都拒绝；不靠空字符串默认值掩盖错误。
system/context 是不同信任通道；动态时间、资源状态、工具结果不会自动升为系统指令。

候选模板方案是严格的一次文本插值；具体语法尚未确定。静态纯文本不经过模板解释，
即使含有看起来像占位符的字符也原样保留。动态模板仅使用已声明且获准的上下文状态，
不直接遍历任意 Context、读取全局服务或执行代码。空提示意味着清空有效指导，
不能回落到上一个非空版本。排序规范用整数 order + ASCII key，不依赖语言本地 locale。

Profile revision 的绑定时机、动态渲染频率及结果生效范围均待 review。
例如 session run start 渲染得到本次运行使用的文本；模板不因此被改写，其他 Agent 的渲染结果也不受影响。
同一步技术 retry 复用快照。若退休政策需立即停止既有 Run，作为显式治理事件阻断后续动作，
不能静默修改已发送请求。供应商要求换历史或重选模型时新建 Step，保留变更依据。

## Cordis 承载映射（本项目提案）

Profile 适配插件将已发布定义注册到 Agent scope；变量/运行时上下文由各事实 owner 插件供应；
工具插件注册协议及工具指导。渲染服务通过显式依赖取得获准的状态视图，
由后续 hook／插件的业务契约触发，再将结果交给请求组装。模板本身不充当插件或 hook。
每次注册有确切 owner 与 disposer，卸载影响之后的组装；已经记录的请求不可被 disposer 擦除。

Context scope 不是安全沙箱：插件拿到错误租户服务仍可能越权，所以域查询和调用边界照常验证 scope。
全局默认贡献必须按租户装配后接纳，不能以 global registry 绕过租户治理。

不直接采纳 DSH 对 system/message 的原位替换或 in-history 更新策略；OpenRouter 适配器负责传输投影。
实际请求证据与会话用户消息分别归档，使 DSH 的日志派生与 LangChain 的临时 system message
两种实现都可映射到同一领域语义。字段完全相同的工具定义只引用一次。
