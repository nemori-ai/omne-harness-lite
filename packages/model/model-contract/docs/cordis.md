# Model 契约的 Cordis 接入

本包不依赖 Cordis，不声明框架键或全局 Context。Cordis 消费者从 [model-cordis-contract](../../model-cordis-contract/docs/cordis.md)取得唯一 Service 定义，以本包的操作类型调用。

应用显式选择提供者。请求的主体、租户、用途和固定采用来自业务参数，不能从容器的全局状态推断。登记撤除由框架契约负责，真实业务取消及结果保管仍沿本包 [SPEC](../SPEC.md)。
