# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，重导出四个函数与类型，以及命令一侧的两个类型
- [host-files.ts](host-files.ts)：宿主文件设施、对象身份读取与共用文件引擎
- [host-domain.ts](host-domain.ts)：宿主文件责任域：获取记录、门面、配额与排空
- [host-provider.ts](host-provider.ts)：宿主提供者：`files` 与 `command`、资源恢复
- [host-command.ts](host-command.ts)：宿主命令设施：前置检查、启动、帧读取、有界缓冲、进程句柄与停止
- [host-scope.ts](host-scope.ts)：systemd 用户 scope：起单元、强制停止与确认、按描述列举、引用的读写
- [host-probe.ts](host-probe.ts)：`command` 的平台前提探测（P1、P3～P6）
- [command-gate.ts](command-gate.ts)：命令的门进程脚本，在命令的单元里运行，不被导入
- [cordis.ts](cordis.ts)：`./cordis` 入口：Service 子类、两个声明插件、宿主文件插件与两份配置 Schema

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与依据。宿主文件读[架构的宿主文件使用](../docs/architecture.md#宿主文件使用)，再读 `host-files.ts`。宿主命令读[架构的宿主命令机制](../docs/architecture.md#宿主命令机制)，再读 `host-command.ts`、`host-scope.ts` 与 `command-gate.ts`。装配读 [Cordis 说明](../docs/cordis.md)，再读 `cordis.ts`。
