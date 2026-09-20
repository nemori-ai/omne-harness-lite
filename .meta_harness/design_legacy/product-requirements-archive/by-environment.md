# 环境维度索引

本页按产品的**环境维度**观察面检索要求；它是索引，不是能力维度，也不预设插件边界。

| 身份 | 当前要求 | 主维度 | 副维度 |
|---|---|---|---|
| `PF-002` | [PF-002：外部环境感知与响应](PF-002-external-change-response/README.md) | `environment` | `user`、`agent` |
| `PF-011` | [PF-011：面向未来的复杂日程规划、日历与通知提醒](PF-011-future-planning-calendars-and-reminders/README.md) | `agent` | `environment`、`user` |
| `PF-012` | [PF-012：Computer、Browser、Shell 能力与沙盒／本机使用](PF-012-computer-browser-shell-sandbox-and-native-use/README.md) | `environment` | `agent`、`user` |
| `PF-014` | [PF-014：运行时发现与按需装载工具、技能](PF-014-runtime-tool-and-skill-discovery-and-loading/README.md) | `agent` | `user`、`environment` |
| `PF-015` | [PF-015：制品管理与隔离工作副本](PF-015-artifact-management-and-isolated-working-copies/README.md) | `agent` | `user`、`environment` |
| `PF-016` | [PF-016：Agent 开发 Cordis 插件并在线部署装载](PF-016-agent-developed-cordis-plugins-and-live-deployment/README.md) | `agent` | `user`、`environment` |
| `PF-018` | [PF-018：使用 omne-selfound 的知识与认知能力](PF-018-selfound-knowledge-and-cognition-use/README.md) | `agent` | `user`、`environment` |
| `PF-020` | [PF-020：依赖可用性、局部离线与诚实降级](PF-020-dependency-availability-and-degradation/README.md) | `environment` | `user`、`agent` |
| `PF-021` | [PF-021：多机器接入、工作部署与动态装配](PF-021-multi-machine-deployment-and-assembly/README.md) | `environment` | `user`、`agent` |

同一要求只由其 topic 正文拥有；多维度出现只表示不同观察面。

## 来源处置

源索引 `docs/requirements/product/environment/README.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `2589e2bf14929458bdc644f4d7f7b6627c1673d297339450fc22baeaf5cfb48b`）按当前 topic 元数据重建；原索引不复制，恢复坐标为 `git show e3573ca72d18bfe7ddd002df5025551b51eede46:docs/requirements/product/environment/README.md`。完整理由见 [来源处置清单](../source-disposition.md)。
