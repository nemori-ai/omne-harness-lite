# 采用范围的必要来源

上游固定为 `deepseek-ai/deepseek-harness@c291e7961a515f6d7af9304e7fd1d257929aef26`。
包 manifest 的版本是 `0.1.5-rc.2`；本轮针对此源码提交，不声明同号 npm 包与源码
等价。本页保存采用决定需要的可复核事实与来源入口。

[来源清单](evidence/source-inventory.json)记录 14 个来源包路径、manifest 哈希、
依赖和源码中的 DeepSeek 名称引用。名称扫描包含注释、自引用和类型声明，不是
精确运行时依赖图；结合清单识别待处理耦合，不替代导入时的隔离构建检查。

| 观察 | 固定版本的官方来源 | 对本次选择的影响 |
|---|---|---|
| Cordis 通过 Context、service、插件/effect 组织组合与生命周期 | [服务](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md)、[生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md) | 继续使用官方内核；业务状态/权限/恢复由项目契约定义 |
| scope 是可见性与贡献辅助；agent 的完整入口使用 Session、LLM、scope 等，并有 Typert 类型耦合 | [scope](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/scope/src)、[agent](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent/src) | 定向复用原语，现有 [agent 导入](../agent-runtime/fork/plan.md) 已验证可切片，不据包名认定无业务耦合 |
| session 使用 LLM 消息类型；projection 提供从会话事实重建状态的独立机制 | [session](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/session/src)、[projection](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-projection/src) | 纳入二者，重建共享数据与能力边界，不使 Session 依赖模型运行时 |
| persistence 与 JSONL 后端分离；JSONL 顶层加载 zstd、win32 和 migration-verifier，默认 zstd；storage.ts 还从 llm 引入 errorChain | [persistence](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence/src)、[JSONL 入口](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/index.ts)、[storage.ts](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-persistence-jsonl/src/storage.ts) | 普通 JSONL 必须真正裁剪依赖，设置 none 不足以形成目标后端；目标耐久性需重新验证 |
| loop 组合 agents/sessions/llm/tools/systemPrompt/sessionProjections，并有 settings 等周边引用 | [loop](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/index.ts)、[上下文装配](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/runtime-context.ts) | 本批共同设计 Loop/Session/tools/LLM 接口，工作控制采用 OMNE 要求 |
| tools 有注册和执行流水线及调用上下文，包含 code-runtime/PTC 和 user-approval 的耦合；system-prompt 单独管理内容贡献 | [tools](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/tools/src/index.ts)、[system-prompt](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/system-prompt/src) | 复用机制价值，新的多命令、HITL、后台与 skill 组合必须正式设计 |
| LLM 提供服务接口和 adapter 机制，入口带 Typert；消息还引用 attachment 类型 | [LLM 入口](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/llm/llm/src/index.ts)、[adapter 指南](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cookbook/adding-an-llm-adapter.md)、[attachment](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/attachment/attachment/src) | 纳入 LLM 与有限媒体辅助，但 OpenRouter 提供者和项目内容契约仍需新设计 |

这些观察支持“选中源码并二次开发”，不构成上游能力可直接满足本项目所有要求的
证据。各文件的具体切片、测试和源设计基线在所属能力的导入任务中完成。

## 许可边界

固定提交的根 [LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/LICENSE)
为 MIT，允许复制、修改与再分发，要求在副本或实质部分保留版权及许可文本。
定向复制 package 或部分文件也受此要求约束。选中来源包的 manifest 标注 MIT；
这不替代逐文件版权头、vendored/native 代码和最终依赖的许可核对。

本批不取用 JSONL 中的 Zstd/native 等额外路径；若后续改变范围，重新检查相应
文件与依赖条款，不能把根 MIT 当作全部第三方内容的统一授权。实际导入沿已有
agent fork 的 provenance/原件/差异模式留存证据；本决定尚未导入其它产品源码。
