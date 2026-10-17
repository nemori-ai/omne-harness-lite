# model-cordis-contract 测试夹具

本目录保存测试需要的固定输入及其来源。

| 文件 | 内容与来源 |
| --- | --- |
| `exports.json` | 两个入口的导出清单与模块增补。来源是 [public-api](../../docs/public-api.md) 的代码块。按入口和章节分组，每项标 `pending`。顶层 `expectedPending` 是 `pending` 总数，落地名字时同步降低 |
| `install-policy.json` | 安装闭包的禁止清单，按类别列出包名与通配。框架契约策略允许 Cordis，禁止默认 Model 与供应商实现、pi、厂商 SDK、分词引擎、词表和存储引擎 |

public-api 改变时，同步改清单。清单与产物的差异由[导出清单比对](../exports.spec.ts)报告。

[目录索引](index.md)。
