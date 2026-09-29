# RT10 消费者影响（candidate）

本版消费 MR9，增加 required inputCalibration；原 RT9 十三服务操作的身份、失败集合与提交/取消/重发政策保留。没有旧格式过渡入口。原调用当前格式不能被可靠解释时明确失败并保留责任，不能偷偷发送或补写旧值。

| 消费者 | 必须变化 | 不由本批改变 |
|---|---|---|
| model-response 值 codec | MR9 required 判别形状、跨值校验、完整待提交投影 | CA2 账单、MS6 reply 形状 |
| 传输/适配/计量 | 保留 input observation 原事实、版本化投影与 φ/δ 依据；公开组件显式输入 | 不新建 store/service、不假每块准确 |
| runtime planner | 稳定前缀增量、失效全量、精度合成、固定 plan | bytes/图片仍检查完整请求 |
| service/日志结算 | 授权选取真实祖先、同次 payload 原批写入、未知原批恢复 | 旧日志绝不更新，十三操作不增 |
| demo/调用消费者 | 消费新当前格式、提供来源/显式配置、观察 mode/precision/原因 | 无完整 Agent Loop/compaction/Session 产品扩展 |

提供者设计由独立 realization 工作承接；本页不是提供者设计或接受记录。MP6 的 cap/tokenMargin 语义不变，不为适配依据另出 MP7。
