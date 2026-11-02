# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

| 入口                                 | 源码                              | 内容                                                                                                                         | 调用者资格              |
| ------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `@omne-harness/agent-context`        | [src/index.ts](../src/index.ts)   | 四个工厂、材料库、三个第一波读口（`absentAccountTarget`、`firstWaveTools`、`absentStepResults`）与类型。不导入 Cordis        | 持有所需端口的调用者    |
| `@omne-harness/agent-context/cordis` | [src/cordis.ts](../src/cordis.ts) | 插件类 `AgentAccountOutletProvider`、`AgentContextProvider`，常量 `MODEL_PREPARATION_RESOURCES`、`DEFAULT_MATERIAL_CAPACITY` | 装配代码，Cordis 上下文 |

## 定义索引

| 定义                                                                                                     | 位置                                              | 行为条款                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `createAgentAccountOutlet`、`AgentAccountOutletOptions`                                                  | [src/account-outlet.ts](../src/account-outlet.ts) | SPEC [账目出站](../SPEC.md#outlet)、[事实字段](../SPEC.md#outlet-fact)、[结果映射](../SPEC.md#outlet-map) |
| `AccountTargetResolver`、`absentAccountTarget`                                                           | 同上                                              | SPEC [账目目标解析器](../SPEC.md#target-resolver)                                                         |
| `createContextMaterials`、`ContextMaterials`                                                             | [src/materials.ts](../src/materials.ts)           | SPEC [证据与记录键](../SPEC.md#records)、[材料库](../SPEC.md#materials)                                   |
| `createAgentModelContext`、`AgentModelContextOptions`                                                    | [src/model-context.ts](../src/model-context.ts)   | SPEC [可读上下文读取](../SPEC.md#model-context)                                                           |
| `createAgentRequests`、`AgentRequests`、`AgentRequestsOptions`                                           | [src/requests.ts](../src/requests.ts)             | SPEC [请求准备](../SPEC.md#requests)                                                                      |
| `ToolsSource`、`firstWaveTools`、`StepResultSource`、`absentStepResults`                                 | [src/translate.ts](../src/translate.ts)           | SPEC [请求准备的取法](../SPEC.md#requests-groups)、[`derive`](../SPEC.md#requests-derive)                 |
| `AgentAccountOutletProvider`、`AgentAccountOutletConfig`                                                 | [src/cordis.ts](../src/cordis.ts)                 | SPEC [出站插件](../SPEC.md#outlet-plugin)                                                                 |
| `AgentContextProvider`、`AgentContextConfig`、`MODEL_PREPARATION_RESOURCES`、`DEFAULT_MATERIAL_CAPACITY` | 同上                                              | SPEC [上下文插件](../SPEC.md#context-plugin)                                                              |
