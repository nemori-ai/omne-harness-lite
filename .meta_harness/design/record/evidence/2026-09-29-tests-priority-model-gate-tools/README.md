# OpenAI／Anthropic 认证工具的 HUB 交付验收

2026-09-29，源码 `9246d3dd`。主线按本轮交付委托接受 public-v2／service-v3 认证工具在以下范围的可运行交付。本记录不增加产品应用；工具作为私有开发验收入口随原始证据保存。

## 实际运行

| 范围 | HUB 结果 |
| --- | --- |
| public 适用矩阵 | 16 型号共44场景：工具16、图片8、high effort16、停止序列4；每场景生产 invoke/planner＋受控 TLS 一次、先预留再HTTP、complete/settled |
| 真实认证 service | 16 型号每款3轮，真实注册/授权、SQLite、SL3、host与业务/诊断关闭；每款3次HTTP、3 settled。Luna复用同源码本轮刚完成的positive，其他15款新运行 |
| 服务六类场景 | positive/encrypted_three/unsupported_second/unknown_cost/in_band_failure/zero_http_refusal 分别3/3/1/1/1/0 HTTP；完整加密组后续wire各出现一次；第二轮真实不支持输入发前拒绝 |
| 费用与关闭负控 | unknown保持unknown并停止后续发送；没有用0替代；六场景业务、诊断、host关闭均真实通过 |
| 入口负控 | public和service各5项：模式、唯一账本、未审核场景、变动源码、夹具目录事实均在密钥/正式账本/HTTP之前拒绝；脱敏映射5项通过 |

输入索引与逐项源码、场景、public wire、profile及配置 SHA 见[inputs.json](inputs.json)；[原始证据包](original-evidence.tar.gz)含当前脚本、工具所引用的产品源码输入、场景、完整安全收据和原运行日志。全包逐文件 SHA 回读通过。service线上wire接口不可得，仍明确 unavailable；受控TLS请求摘要不冒充线上wire。

实际 paid 路径先前有限观察分别见[Sonnet 工具/图片](../2026-09-29-tests-sonnet-tool-image/README.md)及[Luna 加密历史三轮](../2026-09-29-tests-luna-encrypted-service/README.md)，均按各自精确源码/绑定读取；本轮矩阵本身没有付费。

## 失败保留与接受边界

第一次 typed-negative 运行因作者冻结结果已存在而触发 EEXIST；原失败日志保留。主线复制相同driver，仅把结果路径改为本轮独立路径，随后通过，未覆盖作者冻结结果或修改业务断言。

以上关闭的是两家认证工具的可运行性及当前适用清单。不能据合成上游事件声称模型真实支持、TTL命中、参数效果、实际费用或37型号全部线上认证；不执行工具调用本身。Pro 的未知统计口径不因本机三轮成功而消失，未支持的模型声明输入范围另由各型号交付处理。后继共享接口迁移须更新工具调用并重验受影响门，旧场景受source SHA保护不可直接发送。

原本机SQLite/JSONL及生成凭据留在私有目录；本包不公开凭据、密文或完整数据库。归档 SHA256：`689ec8228734a3a90a35e1b5499111a76a333f4b4169684523f0a136ab6c4f41`。
