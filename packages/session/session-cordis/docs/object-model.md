# Session 具体装配：object-model

具体插件持有框架资源与纯实现对象，Service 类与键从 [session-cordis-contract](../../session-cordis-contract/docs/cordis.md) 复用。SessionService 是长期服务；Session、Run 与 attempt 是显式治理值，不与 Context 树一一对应。
