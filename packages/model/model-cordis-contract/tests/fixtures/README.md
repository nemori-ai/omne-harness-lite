# model-cordis-contract 测试夹具

本目录保存测试需要的固定输入及其来源。

| 文件 | 内容与来源 |
| --- | --- |
| `exports.json` | 两个入口的导出清单与模块增补。名字由 `src/` 声明，所属章在 [public-api](../../docs/public-api.md)。按入口和章节分组，每项标 `pending`。顶层 `expectedPending` 是 `pending` 总数，落地名字时同步降低 |
| `install-policy.json` | 安装闭包的禁止清单，按类别列出包名与通配。框架契约策略允许 Cordis，禁止默认 Model 与供应商实现、pi、厂商 SDK、分词引擎、词表和存储引擎 |
| `consumers/<角色>/` | 一个角色的消费夹具，是只依赖已安装制品的小工程。本成员只有一个角色 `cordis-plugin`（Cordis 消费插件）。目录里有 `fixture.json`（`role`、`dependencies`、可选的 `forbidden`）、`tsconfig.json`、`fixture.ts`，另有同目录的辅助 `.ts` 文件。目录里没有 `package.json`：有了它，夹具对本包的导入不再按包自引用解析，依赖图检查会把它们报为不可解析。夹具只导入自己声明的包名，目录里不安装依赖。格式与判定同 [model-contract 的夹具说明](../../../model-contract/tests/fixtures/README.md) |
| `consumers/roles.json` | 本成员必须有夹具的角色清单，现在是 `{"roles": ["cordis-plugin"]}`。清单里的角色缺夹具时整组运行失败 |

`tests/fixtures/consumers/` 不在 `tsconfig.test.json` 与 vitest 的范围内：夹具只由设施针对已安装的制品编译和运行。

public-api 改变时，同步改清单。清单与产物的差异由[导出清单比对](../exports.spec.ts)报告。

[目录索引](index.md)。
