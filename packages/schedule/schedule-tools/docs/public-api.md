# 公开入口

根入口 [index.ts](../src/index.ts)导出工具作者、环境适配、详情工厂及公开 schema。类型与方法只在源码定义。

| 入口                             | 责任                                       | 定义                                    |
| -------------------------------- | ------------------------------------------ | --------------------------------------- |
| createScheduleToolModule         | 消费 commands/queries，构造九动作工具作者  | [author.ts](../src/author.ts)           |
| createScheduleToolEnvironment    | 从原 Tool 耐久记录恢复可信上下文和固定意图 | [environment.ts](../src/environment.ts) |
| createScheduleToolDetails        | 返回 guard、固定引用构造和分页读取         | [details.ts](../src/details.ts)         |
| 参数、结果、采用身份与参数 codec | 严格动作联合和版本化采用                   | [protocol.ts](../src/protocol.ts)       |
| createScheduleToolsPlugin        | 注入公开服务，注册和撤除贡献               | [cordis.ts](../src/cordis.ts)           |

工厂依赖是本地宿主端口，不是线上 DTO。Schedule 业务协议归 schedule-contract；Tool 耐久调用及结果协议归 tool-contract。不要导入私有模块，或把进程对象写入公共请求。
