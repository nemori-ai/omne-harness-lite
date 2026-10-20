# Session Cordis 定义的行为边界

当前根入口与 `./cordis` 均为空。公共定义及机制仍是候选，具体内容见 [Cordis 协议](docs/cordis.md)。领域操作沿 [session-contract SPEC](../session-contract/SPEC.md)，本包不另定治理语义。

## 唯一性

本包唯一拥有本域 Service、键、Context 与 Events 增补。定义不得依赖具体提供者或通过根入口加载框架绑定。

## 生命周期

Session 不提供运行实例目录。服务提供者按显式租户与会话身份处理操作，通知不替代共同提交。

## 实现与验证

具体插件归 [session-cordis](../session-cordis/README.md)。定义实现时验证唯一服务身份、类型增补、定义入口不引入提供者以及文档规定的生命周期。现有骨架测试不证明这些保证。
