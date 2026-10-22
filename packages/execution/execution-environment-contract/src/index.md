# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，只做再导出
- [identity.ts](identity.ts)：访问身份、原调用引用、获取键
- [binding.ts](binding.ts)：绑定层与连续性
- [requirement.ts](requirement.ts)：隔离断言与环境要求
- [facility.ts](facility.ts)：设施表、设施声明、设施请求与结果
- [facilities/files.ts](facilities/files.ts)：文件设施
- [facilities/command.ts](facilities/command.ts)：命令设施与进程句柄
- [facilities/terminal.ts](facilities/terminal.ts)：终端设施
- [ports.ts](ports.ts)：受管资源、三个需要端口与恢复授权
- [lease.ts](lease.ts)：落点、采用记录、租约与获取状态
- [environment.ts](environment.ts)：提供者接口、操作面与登记面
- [need-declaration.ts](need-declaration.ts)：工具环境声明、schema 与采用身份
- [blocks.ts](blocks.ts)：两条块声明
- [judge.ts](judge.ts)：`judgeRequirement` 与 `matchProviders`
- [decode.ts](decode.ts)：内部解码器与 Standard Schema 包装

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与条款，再读对应源文件的精确类型。模块怎样切分见[内部架构](../docs/architecture.md#模块与依赖)。
