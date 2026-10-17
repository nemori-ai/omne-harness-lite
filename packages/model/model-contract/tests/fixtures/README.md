# model-contract 测试夹具

本目录保存测试需要的固定输入及其来源。

| 文件 | 内容与来源 |
| --- | --- |
| `exports.json` | 根入口的导出清单。来源是 [public-api](../../docs/public-api.md) 的代码块，加上已采用而尚未写回页面的名字（清单项的 `origin`，现在没有）。按章节分组，每项标 `pending`。顶层 `expectedPending` 是 `pending` 总数，落地名字时同步降低 |
| `install-policy.json` | 安装闭包的禁止清单，按类别列出包名与通配。纯契约策略禁止 Cordis、Model 运行提供者、pi、厂商 SDK、分词引擎、词表和存储引擎 |

public-api 改变时，同步改清单。清单与产物的差异由[导出清单比对](../exports.spec.ts)报告。

[目录索引](index.md)。
