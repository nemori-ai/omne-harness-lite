# src 索引

<!-- documentation:placeholder -->

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

<!-- documentation:placeholder -->

- [README.md](README.md)：源码目录的职责
- [index.ts](index.ts)：根入口与公开定义
- [cordis.ts](cordis.ts)：Cordis 绑定入口，导出 `agentHostPlugin`
- [host-plugin.ts](host-plugin.ts)：`agent-host` 插件、inject 数组与五个服务面
- [host.ts](host.ts)：宿主状态：预约表、槽表、发布权威、空闲回收、恢复与控制入口
- [host-config.ts](host-config.ts)：插件配置的 Standard Schema
- [stage-ports.ts](stage-ports.ts)：六项局部依赖的现取端口
