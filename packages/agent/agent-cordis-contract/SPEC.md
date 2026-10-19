# Agent Cordis 定义的行为边界

当前根入口与 `./cordis` 均为空。公共定义及机制的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受，尚未实现，具体内容见 [Cordis 协议](docs/cordis.md)。领域操作沿 [agent-contract SPEC](../agent-contract/SPEC.md)，本包不另定治理语义。

## 唯一性

本包唯一拥有本域 Service、键、Context 与 Events 增补。定义不得依赖具体提供者或通过根入口加载框架绑定。

## 生命周期

实例登记、条件撤除和旧 token 不删除后继的协议归本包；登记不授予业务推进资格。

## 实现与验证

具体插件归 [agent-host-local](../agent-host-local/README.md)。定义实现时验证唯一服务身份、类型增补、定义入口不引入提供者以及文档规定的生命周期。现有骨架测试不证明这些保证。
