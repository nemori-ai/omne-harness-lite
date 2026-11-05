# 公开接口导航

## 导出入口

根入口[源码](../src/index.ts)导出 createFilesAuthor、createShellAuthor、filesToolModule、shellToolModule，以及两种环境类型。模块工厂接收 JsonValue 配置，拒绝非法配置。消费者通过 Tool loader 或独立执行器使用作者。精确类型归源码，行为归 [SPEC](../SPEC.md)。

./cordis 入口暂不导出绑定。生产贡献辅助件的衔接见 [Cordis](cordis.md)。根入口不加载 Cordis，也不读取宿主文件、进程或平台配置。

## 定义索引

- [files.ts](../src/files.ts)拥有 Files 工厂与固定 executor 身份。
- [shell.ts](../src/shell.ts)拥有 Shell 工厂与固定 executor 身份。
- [environment.ts](../src/environment.ts)定义去除公共请求字段后的已限权门面。宿主仍须填写每次真实身份并执行授权。
- [commands.ts](../src/commands.ts)拥有命令字段与描述。help 返回 tool-contract 的 `commandGuide`：带 `name` 时是该命令的用法行、摘要、JSON Schema 与逐字段说明，不带时是命令清单，两者后面都接工具规则（定义的 `guide`）。
- [protocol.ts](../src/protocol.ts)拥有边界校验。配置与参数不读取主机默认值。
