# tool 消费与系统定位

独立程序与应用装配选择本包作为 Tool 实现。`tool-host-local` 用本包的工厂组成单机宿主。其他领域的生产代码不依赖本包。

本包的安装闭包含 `tool-contract`，不含 Cordis 与其他 Tool 包。目录职责见 [README](README.md)。

## 教学消费入口

从[教学说明](../examples/README.md)准备依赖并运行公开 dist。主程序展示 invoke、lookup、present、readReply 与 releaseDelivery。[专用装配](../tests/example-assembly.ts)独立使用公开 testing 提供者，不导入既有单元测试辅助器或内部源码。

例程的模型消费函数只接收 P14 消息块与实际 Tools.help，根据可见 reference/next 生成新的 read_result 请求。宿主给每次元调用新的消费位置，收齐完整元回应后再投影。身份、资格、结果保管、名额与交付的精确行为仍归 [SPEC](../SPEC.md)。

这一路径使用内存 start authority，与 tool-host-local 的真实本地协调器测试分别提供证据。二者都不证明生产身份、耐久后端或真实 Agent/Session 接入。
