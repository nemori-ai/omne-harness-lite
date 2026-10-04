# Sonnet 5 工具与图片两个真实 public 验收场景

2026-09-29。主线依据本轮交付委托，在实际 OpenRouter 固定 Anthropic 路由执行两项独立 public 调用。此记录接受下列两个场景的有限结果，不代表整个型号、service 路径或八家模型完成。

## 输入与实际结果

| 场景 | 源码基线 | 上游实际结果 | 实际费用 |
| --- | --- | --- | --- |
| tool_schema | `bc248298` | 完整 `lookup__exact` 工具调用，参数为查询 CEDAR；input 504、output 54、reasoning 0 | $0.001548 |
| inline_image | `ea4e1c2b` | 正确识别输入的 64×64 红色 PNG；input 60、output 4、reasoning 0 | $0.00016 |

两项 outcome 均为 complete，原账本条目均已 settled，总计 $0.001708。响应中的 cache read/write 均为 0，本次不验证缓存命中。图片判据按原场景忽略大小写匹配颜色；不声称响应的字面大小写。

[输入索引](inputs.json)记录原场景、批准场景、目录快照、源码及构建入口的精确 SHA、响应安全摘要与两个原始账本条目。[原始证据包](original-evidence.tar.gz)包含 44 份原件，主线按索引逐份回读、核对字节数与 SHA；不包含密钥或完整正式账本。原工具的具体 CLI 与本机前置检查日志一并保存。两次付费进程实际退出 0，transport 关闭，账本在 finally 关闭，单次临时凭据文件已删除。

## 失败与适用边界

第一次归档检查错误地要求图片回答必须为大写 RED，导致归档断言失败；生产调用并未失败。原检查说明保存在包内 archive-first-attempt.txt，后继按原场景的大小写不敏感判据核验响应摘要，未改原收据、未重发请求。

本机 TLS 正向及入口负控属于调用前的工具验证；本表结果来自真实 OpenRouter。仅验证指定图片与工具 Schema，不覆盖所有图像、工具参数、effort、TTL、停止方式或流中失败。没有执行工具本身。本次不支持 service live-wire、长期稳定性、完整模型认证或形式化证明的结论；后继修改须按实际影响复验。

归档 SHA256：`32611993262a9a73dd4d9fe14ffd5c0264672f4d81949f1f9386d78a1946fd06`。
