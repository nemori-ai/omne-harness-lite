# model-contract 测试

本目录拥有可重复执行的测试与验证设施。设施说明、运行命令和未覆盖范围见[验证说明](../verification/README.md#持续验证设施)。

| 文件                                                                                  | 作用                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exports-inventory.ts`、`exports.spec.ts`、`exports-inventory.spec.ts`                | 比对构建产物与导出清单，并证明比对能发现漏导出、多导出、种类错误和过期的 `pending`；另核对清单与 `docs/public-api.md` 的章节和名字，以及 `pending` 总数                             |
| `install/`、`install-judgment.spec.ts`、`closure-judgment.spec.ts`                    | 安装闭包设施，及其纯判断的负例（快层）                                                                                                                                              |
| `install-closure.spec.ts`、`install-probe.spec.ts`、`install-consumer.spec.ts`        | 禁止依赖、`--work-dir` 护栏、离线失败负例，祖先 `node_modules` 越界负例，以及对未修改成员的真实打包与安装，含消费工程只依赖目标成员一项（慢层，起子进程）。创建的 `tmp/install-closure/` 目录在 `afterAll` 里删除 |
| `install-scenario.spec.ts` | 闭包设施的 `--scenario` 步骤：脚本在消费目录里运行、不带继承的模块路径、退出码决定 `scenario-run` 检查；场景能导入目标成员以外的闭包成员；只在给出场景时才要求该检查项（慢层，起子进程，创建的目录在 `afterAll` 里删除） |
| `type-assertions.ts`、`type-assertions.spec.ts`                                       | 品牌值不用类型断言构造的检查（AC-G1-6）；带 `brand-mint:` 的豁免点最多两处                                                                                                          |
| `declaration-equality.ts`、`public-api-types.spec.ts`、`declaration-equality.spec.ts` | 已落地名字在 `docs/public-api.md` 与 `src/index.ts` 里的声明严格相同；后一个文件证明比对器能发现各类形状漂移（慢层，每例建一个 TypeScript 程序）                                    |
| `*.spec-d.ts`、`values.ts`、`type-coverage.spec.ts`                                   | 类型消费的正例与负例；探针的类型化输入；每个已落地类型至少在一个探针里被使用（导入列表里的名字不算）                                                                                |
| `fixture-runner.ts`、`fixture-runner.spec.ts`                                         | 角色夹具运行器：要求每个夹具声明正常路径与失败路径                                                                                                                                  |
| `public-entry.spec.ts`、`credential.spec.ts`                                         | 根入口只有三个运行时键（`MODEL_SEND`、`decodeCredentialId`、`sameCredentialHolder`）；凭据解码函数的成功与每个拒绝原因，以及持有者比较函数                                           |

`src/` 只有已落地的类型声明，运行时值和未落地的类型在清单里标为 `pending`。这些测试不证明协议或生产能力。

[目录索引](index.md)。
