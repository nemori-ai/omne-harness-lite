# GPT-5.6 Luna 加密历史的真实三轮 service 验证

2026-09-29。HUB `9b85c057`，模型 `openai/gpt-5.6-luna`，definition 5／pi-ai:openai mp4-11。真实 OpenRouter 固定 OpenAI 路由，通过示例的真实注册认证、service、SQLite、SL3 及资源关闭链执行三轮；不使用本机 TLS 代替本表上游。

| 轮次 | 计量模式 | 发送前预测输入 | 上游 input/output/reasoning | 实际 USD |
| --- | --- | --- | --- | --- |
| 1 | full estimated | 84 | 15 / 18 / 11 | 0.0000246 |
| 2 | marginal estimated | 60 | 50 / 21 / 13 | 0.0000352 |
| 3 | marginal estimated | 93 | 83 / 6 / 0 | 0.0000238 |

三次 complete，原响应均耐久，账本全部 settled，总计 $0.0000836；业务与诊断关闭完成后释放 host，进程退出0，临时凭据文件已删除。第一、二个响应各含一个 opaque thinking 块及 text；第三个为 text。实际诊断记录 full→marginal→marginal，后两轮 replayContribution 为18/21，newContribution 为27/22；reasoning 是 output 子集，未重复相加。第二轮未再触发此前 input_size_unavailable。

[输入与读数](inputs.json)保存安全摘要、三个原账本条目、从实际诊断提取的计量事实及私有原日志 SHA。[原始证据](original-evidence.tar.gz)保存场景/审核、目录原始响应、收据、所引用源码和本机先导日志，逐项 SHA 回读通过。含密文的业务原日志、SQLite 和生成密钥仅保留于私有工作目录，不放进本公开记录。

## 证据边界

本次是单段三轮、low effort、短文本会话；缓存读写均0，不认证缓存、其他 effort、工具、图片或整个型号。service 未暴露 live wire SHA，工具如实记录 unavailable，不以 profile/source SHA 冒充线上 wire。场景要求完成并耐久，不另声明答案正确性的独立验收。

第二、三轮总输入预测各比实际多10；这不能独立归因于 φ 的零 framing 假设，更不能据一段轨迹固定减10或声称 O 精确等于回放输入。当前算法仍为 estimated，并按配置施加 margin。多旧组 full/δ、模型切换及压缩另行验证。

源码后继图片规则已升 definition 6／mp4-12；本记录只证明上述精确绑定，不能直接当作后继全型号认证。先前失败及 unknown 费用责任原样保留，本次成功不将旧 unknown 改成0。归档 SHA256：`f314969b33714cc7274d6439aabd7cdfbee7a6ef301d07fde4c5e8cf21a049f5`。
