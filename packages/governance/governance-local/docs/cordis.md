# Cordis 集成

## 集成入口

`./cordis` 暂无导出，尚不能注册运行服务。后续实现必须消费 governance-contract 中唯一的 GovernanceContributionsService，不重复声明服务键。迁移工厂可独立使用，不依赖 Context。

## 生命周期与清理

Caller fiber 的贡献租约须与其精确退出绑定。原操作未返回时卸载仍应认回并撤除已登记贡献。共享 SqlStorage 和 Identity 由装配拥有者关闭。这些是提供者剩余实施义务，不是已有 Cordis 保证。
