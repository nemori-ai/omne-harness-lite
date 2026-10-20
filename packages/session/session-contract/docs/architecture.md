# Session 纯契约的架构边界

本包拥有公共值、操作、结果、行为与可替换提供者端口。运行接口仍是候选，精确接受范围见 [SPEC](../SPEC.md)。当前源码入口为空。

## 依赖方向

消费者依赖本包；[session](../../session/README.md) 消费契约提供通用实现；[session-cordis-contract](../../session-cordis-contract/README.md) 将同一操作定义绑定到 Cordis；[session-cordis](../../session-cordis/README.md) 提供具体装配。本包不依赖这三个下游成员，不安装 Cordis 或具体宿主。

## 值与行为

公开值及端口见 [公开入口](public-api.md)。边界校验可由本包实现；调度循环、事务提供者、框架插件及实现工厂不属于本包。内部实现机制由 [session](../../session/docs/architecture/README.md) 拥有。

## 当前设计限制

Session 是工作治理服务，Run 与 attempt 是治理对象，不是运行实例。本包没有每会话根 Context 或实例目录。事务端口的真实持久性仍由具体提供者证明。
