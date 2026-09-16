# 核心工作协调 v1 验证说明

| 义务 | 所需证据 | 当前状态 |
|---|---|---|
| committed-blocked 不能退化为 pending/not-committed 或提前效果 | CC-S01/S04 真实 writer + Admission + owner 联合测试 | 未执行 |
| 完整 owner baseline 原子安装并拒绝部分/旧代确认 | CC-S01/S02/S03 故障注入与并发读取测试 | 未执行 |
| 旧 ExactUse/资源责任在 reopen 前闭合 | CC-S06 owner 联合测试，覆盖释放失败和未知 | 未执行 |
| 恢复后原 operation 不重复外部效果 | CC-S04/S05 的 lookup、inspect、关联与重复请求测试 | 未执行 |
| Admission 既有模型 | 当前模型仅覆盖授权、效果前耐久与停止后迟到启动 | 不覆盖 crash/recovery、baseline 安装、ExactUse 恢复或多 owner 原子发布 |

本轮文字是 candidate 设计澄清。模型、旧测试或接口名称不能替代上述真实组合证据；实现采用前还须
固定源码 revision、恢复宿主、全部 owner 清单、writer/host generation 与实际失败注入结果。
