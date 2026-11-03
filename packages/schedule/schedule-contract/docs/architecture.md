# 成员架构

本成员拥有可序列化公开契约。values、recurrence、work和definition组成声明模型；commands、queries、results和services组成服务边界。operation规范化业务意图并生成指纹，json-schema从同一schema派生。

成员关系与依赖方向归[组架构](../../docs/architecture.md)。本包依赖schema与规范JSON机制，不依赖Schedule实现、Tool、Session或Agent runtime。公共协议不包含工厂回调、SQL参加者或本机句柄。服务接口可由本地应用或未来远程客户端实现。
