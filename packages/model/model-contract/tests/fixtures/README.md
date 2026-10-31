# model-contract 测试夹具

本目录保存测试需要的固定输入及其来源。

| 文件 | 内容与来源 |
| --- | --- |
| `exports.json` | 四个入口（根入口、`./provider`、`./testing`、`./conformance`）的导出清单，按入口列名。名字由 `src/` 声明，所属章在 [public-api](../../docs/public-api.md)。每个入口内按章节分组，每项标 `pending`。顶层 `expectedPending` 是 `pending` 总数，落地名字时同步降低 |
| `install-policy.json` | 安装闭包的禁止清单，按类别列出包名与通配。纯契约策略禁止 Cordis、Model 运行提供者、pi、厂商 SDK、分词引擎、词表和存储引擎 |
| `consumers/<角色>/` | 一个角色的消费夹具，是只依赖已安装制品的小工程，也是该角色怎样只靠公开契约消费本包的可运行示例。目录名就是角色名，里面有 `fixture.json`、`tsconfig.json`、`fixture.ts`，另可有同目录的 `.ts` 辅助文件。`fixture.json` 写 `role`（与目录名相同）、`dependencies`（夹具要导入的包名，只列这些）和可选的 `forbidden`（这个夹具另外禁止的包名或通配）。夹具目录里没有 `package.json`：有了它，`@omne-harness/model-contract` 这类导入就不再按成员自己的包自引用解析，依赖图检查（`pnpm run lint:deps`）会把夹具的导入报为不可解析。`fixture.ts` 导出 `fixture`，写明角色名和一组路径（名字、`normal` 或 `failure`、失败路径必填的 `decision`、`run`）。夹具只导入自己声明的包名，不用相对路径跨出自己的目录，目录里不安装依赖。运行方法见[验证说明](../../verification/README.md#角色夹具) |
| `consumers/roles.json` | 本成员必须有夹具的角色清单，形如 `{"roles": [...]}`。清单里的角色缺夹具时整组运行失败，所以夹具不能靠删除来通过 |

`tests/fixtures/consumers/` 不在 `tsconfig.test.json` 与 vitest 的范围内：夹具只由设施针对已安装的制品编译和运行。新增角色时，同时在 `roles.json` 登记。

public-api 改变时，同步改清单。清单与产物的差异由[导出清单比对](../exports.spec.ts)报告。

[目录索引](index.md)。
