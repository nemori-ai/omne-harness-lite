# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口                                 | 源码                              | 内容                                                                        | 调用者资格              |
| ------------------------------------ | --------------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| `@omne-harness/agent-context`        | [src/index.ts](../src/index.ts)   | `createAgentAccountOutlet`、`absentAccountTarget` 与两个类型。不导入 Cordis | 任何持有收件口的调用者  |
| `@omne-harness/agent-context/cordis` | [src/cordis.ts](../src/cordis.ts) | 插件类 `AgentAccountOutletProvider`                                         | 装配代码，Cordis 上下文 |

## 定义索引

| 定义                                                     | 位置                                              | 行为条款                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `createAgentAccountOutlet`、`AgentAccountOutletOptions`  | [src/account-outlet.ts](../src/account-outlet.ts) | SPEC [账目出站](../SPEC.md#outlet)、[事实字段](../SPEC.md#outlet-fact)、[结果映射](../SPEC.md#outlet-map) |
| `AccountTargetResolver`、`absentAccountTarget`           | 同上                                              | SPEC [账目目标解析器](../SPEC.md#target-resolver)                                                         |
| `AgentAccountOutletProvider`、`AgentAccountOutletConfig` | [src/cordis.ts](../src/cordis.ts)                 | SPEC [出站插件](../SPEC.md#outlet-plugin)                                                                 |
