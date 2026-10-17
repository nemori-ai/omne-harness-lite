# model-cordis-contract 测试

本目录拥有可重复执行的测试与验证设施。设施说明、运行命令和未覆盖范围见[验证说明](../verification/README.md#持续验证设施)。

| 文件 | 作用 |
| --- | --- |
| `exports-inventory.ts`、`exports.spec.ts`、`exports-inventory.spec.ts` | 比对两个入口的构建产物与导出清单，核对模块增补，并证明比对能发现漏导出、多导出、种类错误和过期的 `pending`；另核对清单与 `docs/public-api.md` 的章节和名字，以及 `pending` 总数 |
| `install/`、`install-judgment.spec.ts`、`closure-judgment.spec.ts` | 安装闭包设施，及其纯判断的负例（快层） |
| `install-closure.spec.ts`、`install-probe.spec.ts`、`install-consumer.spec.ts` | 禁止依赖、`--work-dir` 护栏、离线失败负例，祖先 `node_modules` 越界负例，以及对未修改成员的真实打包与安装（慢层，起子进程）。创建的 `tmp/install-closure/` 目录在 `afterAll` 里删除 |
| `fixture-runner.ts`、`fixture-runner.spec.ts` | 角色夹具运行器：要求每个夹具声明正常路径与失败路径 |
| `public-entry.spec.ts`、`cordis-entry.spec.ts` | 两个入口的运行时导出，后续阶段改为已接受的定义 |

当前 `src/` 仍是骨架，清单里的声明全部标为 `pending`。这些测试不证明协议或生产能力。

[目录索引](index.md)。
