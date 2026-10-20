# Model 源码

本目录拥有公开类型、运行时校验和内部实现。[index.ts](index.ts) 已导出凭据发送接缝与存在性、解析的判定，还导出 [execute.ts](execute.ts) 的独立执行和 [runtime.ts](runtime.ts) 的运行工厂。[send.ts](send.ts) 提供独立产品发送边界；受理、查询、取消意图、原流保存与最小实例观察已实现。已确认调用的收场支持范围见[实现规格](../SPEC.md#已实现的调用收场)，结果读取及 processed ACK 已实现，retained ACK、恢复与生产宿主尚未实现。后续实现须依据 [SPEC](../../model-contract/SPEC.md) 的已接受范围，不能仅凭设计声明声称接口已实现。

本地保管库、Cordis 插件与注入发送已迁入 [model-host-local](../../model-host-local/src/index.md)。本包源码不使用 Cordis 与 proper-lockfile，独立 [testing/index.ts](testing/index.ts) 提供内存 Commands 与五端口测试装配，根不转导它。其他 Model 服务的定义归 model-cordis-contract。文档导航见 [index](index.md)。
