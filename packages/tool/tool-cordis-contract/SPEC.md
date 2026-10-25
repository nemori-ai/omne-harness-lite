# tool-cordis-contract 行为规格

本包只拥有 Tool 的 Cordis 定义，不拥有领域行为。公共结果、不变量和协议归 [契约 SPEC](../tool-contract/SPEC.md)。服务定义、依赖分类、登记与撤除协议、事件和验证义务归 [docs/cordis.md](docs/cordis.md)。本页不另写第二份保证。

本包必须保持下列性质：

1. 每个服务键只由一个定义类的 `static provide` 给出，导出的键常量取自该类。
2. `./cordis` 的源码、生成声明和产物都不导入 `@omne-harness/tool` 或 `@omne-harness/tool-host-local`。
3. 根入口不导出值，也不导入 Cordis。
4. ToolRuntimeService 按 ToolRuntime 投影 invoke、inspect、queries、commands、instances、content 与 catalog，不增加普通 admission 或受信回应入口。ToolCommandsService 保留内部协议。
5. 事件名以包名为范围，为 `tool-cordis-contract/call-changed`（IC-10）。
6. ToolStartFenceService 的键为 `toolStartFence`，只投影 `ToolStartFence` 的 `invalidate`。它与 `toolStartAuthority` 由同一提供者兑现同一启动排序域，见契约 SPEC 的[外层调用方的启动围栏](../tool-contract/SPEC.md#外层调用方的启动围栏)。装配用两个排序域分别提供这两个键时，该组合不具备启动围栏保证。

[结果推送与保存](../tool-contract/SPEC.md#结果推送与保存)的接收端口由消费拥有者实现，本包不为它定义服务键。

契约 SPEC 的 [G1–G9 总表](../tool-contract/SPEC.md#342-契约缺口决定)没有归属本包的决定。服务定义的归属由四包拆分确定。

文档导航见 [index](index.md)。
