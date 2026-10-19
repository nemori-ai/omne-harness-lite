# tool-cordis-contract 内部架构

本包只有一个模块 [src/cordis.ts](../src/cordis.ts)。它不持有状态，也不启动资源。

依赖方向是 `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`。本包为类型和 `describedAdoption` 依赖 `tool-contract`，为 `Service` 与 `Context` 依赖 Cordis。本包不依赖 `tool` 或 `tool-host-local`。

Cordis 定义单独成包的理由是安装闭包：`tool-contract` 的安装闭包不能含 Cordis。领域实现与装配机制归 `tool` 与 `tool-host-local`。目录职责见 [README](README.md)。
