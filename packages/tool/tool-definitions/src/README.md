# 源码导航

[index.ts](index.ts)是纯根入口。[environment.ts](environment.ts)定义宿主门面。[commands.ts](commands.ts)与[protocol.ts](protocol.ts)拥有共用声明和校验。[author.ts](author.ts)生成普通文本作者。[files.ts](files.ts)、[files-edits.ts](files-edits.ts)拥有文件操作。[shell.ts](shell.ts)、[shell-output.ts](shell-output.ts)拥有命令映射与输出排空。[text.ts](text.ts)拥有 UTF-8 首尾窗口与 diff。[web.ts](web.ts)是 Web 作者，[web-port.ts](web-port.ts)拥有窄口 `WebAccess` 与附着，[web-protocol.ts](web-protocol.ts)拥有它的命令表与参数解码。

行为归 [SPEC](../SPEC.md)，集成状态归 [Cordis](../docs/cordis.md)。
