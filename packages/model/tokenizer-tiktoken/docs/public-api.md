# 公开接口导航

精确类型归源码，行为归 [SPEC](../SPEC.md)。本页不复制签名。

## 导出入口

| 入口                                      | 源码                        | 导出                                                        | 调用者                  |
| ----------------------------------------- | --------------------------- | ----------------------------------------------------------- | ----------------------- |
| `@omne-harness/tokenizer-tiktoken`        | [index.ts](../src/index.ts) | createTiktokenExecutor、executor/lease/limits 和资源类型    | 宿主 owner 与家族计量器 |
| `@omne-harness/tokenizer-tiktoken/cordis` | `src/cordis/index.ts`       | ModelTokenizersService、modelTokenizersKey、ModelTokenizers | Cordis 宿主与借用消费者 |

根入口只有一个运行时导出，由 [public-entry.spec.ts](../tests/public-entry.spec.ts) 核对。根入口不导入 Cordis，不转导 model-contract 或 operation-result 的名字。worker 协议和同步 engine 不在包导出中。

## 定义索引

| 类型或值                                                    | 定义                                          | 行为                                                                             |
| ----------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| createTiktokenExecutor                                      | [executor.ts](../src/executor.ts)             | [初始化](../SPEC.md#初始化)、[所有权与生命周期](../SPEC.md#所有权失败与生命周期) |
| TiktokenExecutor、TiktokenLease、TiktokenExecutorLimits     | [executor-types.ts](../src/executor-types.ts) | [调度与缓存](../SPEC.md#有界调度与缓存)                                          |
| TiktokenRanks、TiktokenResources                            | [resources.ts](../src/resources.ts)           | [资源核对](../SPEC.md#初始化)、[规范 JSON](../SPEC.md#规范-json)                 |
| ModelTokenizersService、modelTokenizersKey、ModelTokenizers | `src/cordis/service.ts`                       | [借用与关闭责任](cordis.md)                                                      |

TokenizerDefinition、ModelTextTokenizer、TokenizationSegment 与 TokenizationFailure 归 [model-contract](../../model-contract/docs/public-api.md)。Outcome 归 operation-result。
