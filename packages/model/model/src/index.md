# Model 源码索引

- [源码责任与缺项](README.md)。
- [包根入口](index.ts)。
- [本成员公开入口](../docs/public-api.md)。

- [凭据判定与状态快照](credential.ts)。
- [独立发送接缝](deliver.ts)。

- [运行工厂构造壳](runtime.ts)。
- [内存测试公开入口](testing/index.ts)。
- [同步状态与提交](testing/state.ts)、[调用及恢复](testing/calls.ts)、[发出](testing/dispatch.ts)、[归约](testing/arrival.ts)、[读取及清理](testing/consumption.ts)。

[testing/pages.ts](testing/pages.ts) 拥有最终 sealed/partial 投影、目标组页和可完成生命周期的有限保留预算。
