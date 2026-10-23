# src

本目录承载本包的公开定义与实现。[index.ts](index.ts) 是根入口，本文件与 `index.md` 只是文档导航。

## 允许的内容

TypeScript 源码。公开入口由 `package.json` 的 `exports` 声明。

## 边界

源码只用可擦除的 TypeScript 语法。根入口转出 [family.ts](family.ts) 的类型、[family-table.ts](family-table.ts) 的家族表、[config.ts](config.ts) 的配置类型、[transport.ts](transport.ts) 的工厂 `createPiTransport`、[network.ts](network.ts) 的工厂 `createNetworkResources` 与配置类型，以及 [diagnostics.ts](diagnostics.ts) 的观察者类型 `DiagnosticObserver`。子入口 `./chat-completions` 转出 [chat-completions/index.ts](chat-completions/index.ts) 的 `bindChatCompletions` 与引擎类型。子入口 `./testing` 转出 [testing/index.ts](testing/index.ts) 的夹具检查与采用指纹；它读写文件，只供测试与脚本使用。其余机制模块与名字不转出。机制模块只依赖 Node 内置模块与 `package.json` 声明的四个 workspace 成员，不导入 `@deepseek-ai/cordis`。非类型行为写在包根 [SPEC.md](../SPEC.md)，源码注释不代替规格。

[sse.ts](sse.ts)、[chat-completions/projection.ts](chat-completions/projection.ts)、[chat-completions/request.ts](chat-completions/request.ts)、[chat-completions/chunk.ts](chat-completions/chunk.ts) 与 [chat-completions/decoder.ts](chat-completions/decoder.ts) 改编自 pi，带来源头。其他文件是本项目自写的，不带来源头。来源登记见包根 [UPSTREAM.md](../UPSTREAM.md)。

## 维护

新增或改名公开入口时，同步 `package.json` 的 `exports`、[公开接口](../docs/public-api.md)与本目录 `index.md`。改动改编自 pi 的文件时同步包根的 `provenance.json` 与 `UPSTREAM.md`。

## 本包事实

本目录已实现五个家族类型、三段传输（[transport.ts](transport.ts)、[materialized.ts](materialized.ts)、[fact-stream.ts](fact-stream.ts)、[termination.ts](termination.ts)、[payload.ts](payload.ts)、[config.ts](config.ts)）、六个包内机制、网络资源使用的连接池 [pool-agent.ts](pool-agent.ts)，以及两个机制共用的小工具（[iteration.ts](iteration.ts)、[limits.ts](limits.ts)）。家族表（[family-table.ts](family-table.ts)、[canonical-json.ts](canonical-json.ts)）与网关引擎（`chat-completions/` 目录，含请求与流解码）也已实现。引擎不认识任何厂商，该目录的源码不得出现厂商名或型号家族名。测试入口在 `testing/` 目录。
