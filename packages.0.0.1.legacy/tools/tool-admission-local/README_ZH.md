# Tool admission local

根入口提供两个独立工厂：

- `createAdmissionJudgment` 按公共契约判定整批调用。它不读写日志，不执行工具。
- `createToolAdmission` 组合正式经过绑定与持久 token 核验。调用方注入当前会话权限、runner 经过读口、共同历史投影和物理日志 backing。工厂持有一次日志借用，调用者须等待 `close()` 完成。

纯判断函数的 `admission.1` token 是临时定位值。正式绑定使用 core/loop-extension-runner 的 `admission.2` 编码。编码、摘要或 token 正文都不能替代已持久化的官方结论。

`verifyToken` 在读取日志前后检查当前 `tool.submit`。它检查完整前缀、实际官方最终结论、批次完成和原采用，返回核验过的 scope、物理 owner 代与尾。runtime 须用同代同尾条件提交执行意图。核验不消耗 token，也不向普通工具开放协调日志权限。

关闭先拒绝新绑定、判断和核验，再等待已接纳操作实际结束，最后释放日志借用。释放失败向调用者报告，重试关闭不会重新开放入口。

`./cordis` 的独立绑定包括两个具名插件：`toolAdmissionLocal` 注入 sessionAccess、sessionLogBacking、toolAdmissionPassSource 和 toolActionHistory，发布定义包的 ToolAdmissionService；`officialAdmission` 注入该服务和 runner 实现登记服务。贡献随自己的 fiber 撤除。两者只接受空数据配置，活体依赖不能塞进配置。必需依赖撤除会关闭旧提供者，重建不会复活旧引用。

本阶段的 Cordis 提供者未安装语义授权 evaluator。auto 权限路径可用，需要语义授权求值的路径明确返回 unavailable。独立工厂允许调用方注入该评估器；完整交互准入的集成按后续交付范围推进。

固定形状复用公开拥有者的延迟加载校验器。本包不建立固定 Schema 的运行期编译缓存。可选 evaluate 由调用方拥有；缺席或失败时，任何需要授权求值的批次均返回 unavailable。

行为承诺归 [定义包](../../core/tool-admission/SPEC.md)。测试包含受控历史端口与应用的真实 JSONL 投影组合；它们不证明完整模型—工具闭环已经交付。

管理绑定 `managedToolAdmissionLocal` 使用主线装配生命周期。固定 host 持有原根和日志借用，动态子 fiber 发布实际服务。撤动态服务只关闭准入并排空原操作；host 最终关闭才释放借用。`inspectAdmissionPublication` 供可信装配观察实际发布 fiber，不授予业务权限。根工厂的 `closeAdmission()` 关闭入口并排空操作，`close()` 另外完成借用释放。管理行为归 [本包薄规格](SPEC.md)。
