# Tool admission local

当前提供独立的 `createAdmissionJudgment` 函数。它按公共 `tool-admission` 契约判定整批调用，不执行工具、不写日志、不授予会话权限。

调用方须证明输入来自同一会话、同一读时点的真实权限与授权上下文。返回的 token 只是结论引用，必须经已持久化的官方 runner 结论核验后才能用于执行。

内部已有基于可信读口的 `forPass` 绑定。正式 token 编解码由 core/loop-extension-runner 的纯映射统一提供，行为归该包薄规格 TLT1–3。
本包尚未成为完整公开提供者：持久凭据核验和 Cordis 装配仍未接通。runner 经过源和整批调度已有独立实现，真实应用组合待完成。
纯判断函数返回的 admission.1 token 不通过正式 admission.2 解码，解码本身不授予权限。

固定形状复用 content-blocks 和 loop-extension 的延迟加载校验器。本包不建立固定 Schema 的运行期编译缓存。可选 evaluate 由调用方拥有；缺席或失败时，任何需要授权求值的批次均返回 unavailable。

行为承诺归 [定义包](../../core/tool-admission/SPEC.md)。当前单元测试不证明真实权限来源或模型—工具闭环。
