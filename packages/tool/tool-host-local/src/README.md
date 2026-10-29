# tool-host-local 源码

本目录拥有本提供者的独立工厂与内部实现。

- [index.ts](index.ts) 是根入口 `.`，导出启动协调、环境调度与凭据工厂。
- [scheduled-environment.ts](scheduled-environment.ts) 把 [调度策略](environment-policy.ts) 接入环境四动词。实际获取事实由环境提供者拥有。
- [environment-diagnostics.ts](environment-diagnostics.ts) 定义显式受信诊断依赖与固定安全标记。
- [environment-input.ts](environment-input.ts) 核租户、调用、原操作与实时环境采用，并固定准备输入。
- [credentials.ts](credentials.ts) 选择配置引用，并在使用前核实际秘密绑定。真实 vault 尚未交付。
- [start-coordinator.ts](start-coordinator.ts) 实现本地启动协调器，见 [SPEC](../SPEC.md#本地启动协调器g5)。
- 根入口不导入 `@deepseek-ai/cordis`。当前没有 `./cordis` 子入口，后续插件设计见 [Cordis 装配](../docs/cordis.md)。
- 本成员经 `@omne-harness/tool-contract` 消费公共定义，不复制公共类型或服务键。

文档导航见 [index](index.md)。
