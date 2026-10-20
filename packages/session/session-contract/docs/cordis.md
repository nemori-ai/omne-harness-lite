# Session 纯契约与 Cordis

本包不导入 Cordis，不提供 `./cordis` 入口。独立消费者只安装本包。

需要框架服务定义的调用者从 [session-cordis-contract/cordis](../../session-cordis-contract/docs/cordis.md) 取得唯一键与 Service；应用另选 [session-cordis](../../session-cordis/docs/cordis.md) 的具体插件。后两者仍是候选定义与装配骨架，不能据此声称运行集成已实现。
