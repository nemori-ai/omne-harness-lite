# tool 与 Cordis

本包不含 Cordis，也不依赖 `@deepseek-ai/cordis`。这是本包存在的理由：独立程序可以不装 Cordis 而执行工具。Tool 的服务定义归 [tool-cordis-contract](../../tool-cordis-contract/docs/cordis.md)，具体插件归 `tool-host-local`。目录职责见 [README](README.md)。
