# model-cordis-contract 测试

本目录拥有可重复执行的测试与验证设施。设施说明、运行命令和未覆盖范围见[验证说明](../verification/README.md#持续验证设施)。

| 文件 | 作用 |
| --- | --- |
| `exports-inventory.ts`、`exports.spec.ts`、`exports-inventory.spec.ts` | 比对两个入口的构建产物与导出清单，核对模块增补，并证明比对能发现漏导出、多导出、种类错误和过期的 `pending`；另核对清单的每一章都在 `docs/public-api.md` 里链接声明其名字的源码文件、页面链接的源码与测试文件都存在，页面不重复声明，以及 `pending` 总数 |
| `install/`、`install-judgment.spec.ts`、`closure-judgment.spec.ts` | 安装闭包设施（含 `--fixture` 夹具模式与 `fixtures` 入口，字节与 model-contract 的相同），及其纯判断的负例（快层）。夹具模式的拒绝与判断负例由 model-contract 的 `install-fixture*.spec.ts` 覆盖 |
| `install-closure.spec.ts`、`install-probe.spec.ts`、`install-consumer.spec.ts` | 禁止依赖、`--work-dir` 护栏、离线失败负例，祖先 `node_modules` 越界负例，以及对未修改成员的真实打包与安装（慢层，起子进程）。创建的 `tmp/install-closure/` 目录在 `afterAll` 里删除 |
| `fixture-runner.ts`、`fixture-runner.spec.ts` | 角色夹具运行器：要求每个夹具声明正常路径与失败路径 |
| `fixtures/consumers/cordis-plugin/`、`fixtures/consumers/roles.json`、`fixtures-run.spec.ts` | Cordis 消费插件夹具：只靠已安装制品，在真实 Cordis Context 里跑宿主插件（替代提供者、发出变化通知）与被测的消费插件；`fixtures-run.spec.ts`（慢层）经 `fixtures` 入口真实打包、安装、编译并运行，断言汇总 `ok`、角色恰是 `roles.json` 的一个、正常与失败路径齐全。夹具目录不在 `tsconfig.test.json` 与 vitest 的范围内，见[验证说明](../verification/README.md#角色夹具) |
| `public-entry.spec.ts`、`cordis-entry.spec.ts`、`root-entry-closure.spec.ts` | 两个入口的运行时导出：根入口为空，`./cordis` 为定义与键；另沿相对 import 走完根入口的构建产物，证明它们不到达 Cordis |
| `registration-types.spec-d.ts`、`cordis-entry.spec-d.ts`、`call-changed-doc.spec.ts` | 名字的类型形状：登记类型在两个入口是同一类型，Context 增补与键常量的字面量类型，事件载荷，以及构建产物里事件的 `@mode` 与 `@param` |
| `service-definitions.spec.ts` | 十四个抽象 Service 的键与类只写一次，由提供者发布为 `ctx.<键>`，随提供者 fiber 撤除 |
| `converters-harness.ts`、`converters.spec.ts`、`converters-keys.spec.ts`、`converters-conversion.spec.ts`、`converters-release.spec.ts`、`converters-bounded.spec.ts` | 转换目录在真实 Cordis Context 上的行为：查找、键与查询输入的格式、登记与撤除、租约、出借的包装转换件与在途转换、提供者的释放钩子、有界贡献量测量。资格权威由明确标注的替代实现代替，见[验证说明](../verification/README.md#转换目录测试) |
| `identities.ts`、`instances-harness.ts`、`instances.spec.ts`、`instances-bounded.spec.ts` | 实例目录在真实 Cordis Context 上的行为与有界登记量测量。资格权威由明确标注的替代实现代替，见[验证说明](../verification/README.md#实例目录测试) |
| `receivers.spec.ts`、`receivers.spec-d.ts`、`receivers-conformance.spec.ts`、`receivers-reference.ts` | 结果接收登记在真实 Cordis Context 上的行为、类型，以及符合性用例与带缺陷的参考表（负控），见[验证说明](../verification/README.md#结果接收登记测试) |
| `garbage.ts` | 两个有界测试共用的垃圾回收入口 |

清单里没有 `pending` 的名字。目录测试不证明授权核验，也不证明登记失败到根 `ModelFailure` 的映射，见 [SPEC](../SPEC.md#实例目录的未决项)。

[目录索引](index.md)。
