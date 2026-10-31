# model 持续验证

本目录维护本实现的验证责任，共同协议场景由 model-contract/verification 唯一维护。[成员测试说明](../tests/README.md)区分独立执行、发送、受理、观察、有限收场和公开消费的实际覆盖。结果读取与 processed ACK 的组合使用真实 runtime、driver、sender 和内存 Commands；消费者完成记录和上游传输仍为受控替身。完整53项符合性报告保留未支持项，不能据局部通过声明完整托管运行符合。

安装与导入由 `install-closure` 调用[共同安装设施](../../model-contract/tests/install/cli.ts)核对。[策略](../tests/fixtures/install-policy.json)约束安装闭包，[场景](../tests/install/scenario.mjs)只经独立消费目录内的已安装包运行。它覆盖独立执行、凭据判定、最小 runtime、实例观察、产品发送及受信分页控制导出。命令和通过条件归[安装闭包说明](../tests/README.md#安装闭包)，单次报告留任务 tmp。

这些资源不证明真实厂商、生产耐久存储、自动清理工作者、完整 Cordis 宿主或跨进程恢复。本地凭据保管与插件验证归[model-host-local](../../model-host-local/tests/README.md)。

[目录索引](index.md)。
