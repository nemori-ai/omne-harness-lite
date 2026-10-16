# tool 公开接口

根入口 `.` 由 [src/index.ts](../src/index.ts) 定义，源码是唯一定义，本页不手写签名。

- [construction.ts](../src/construction.ts)：`ToolDependencies` 与 `ToolConfiguration`，即 `createToolRuntime` 的构造形状。

`executeTool`、`createIndependentToolScope` 与 `createToolRuntime` 已接受、尚未实现，签名见契约包 [public-api](../../tool-contract/docs/public-api.md#尚未实现的函数m2m3-实现后移除)。实现后签名移入本包源码。目录职责见 [README](README.md)。
