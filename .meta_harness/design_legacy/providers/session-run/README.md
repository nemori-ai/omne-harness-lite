# Run 状态提供者

- 来源：`packages/session/run/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`，SHA-256 `38126d213f825dd45d11a767d1c94724df891f6f80dc70b588671f5ccf42ac9f`
- 当前状态：目标设计，尚无 Run provider 源码；不得把文档接受或邻包 primitives 当成实现。
- 候选坐标：见[设计映射](design.md)

目录名中的 `session-run` 沿用 `packages/session/run` 的来源路径，只表示 Run provider；它不定义、恢复或承载已退役的 `capability.session-run`。

[验证边界](verification.md)区分已有 primitives、目标协议和未实现 Cordis 投影。
