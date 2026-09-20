# 候选与取舍

## 1. 只提供内部 extension sites

- **前提/边界：**项目只承诺原生 S0～S9/旁路 API，外部配置由用户或第三方自行转换；内部能力拥有全部语义。
- **兑现与实现：**最小实现只需 typed registrations、lifecycle disposer 和 observation；安全、动态卸载与测试面最小。
- **失败/处置：**不能满足 PF-025 的 Claude Code/Codex 配置兼容，因此对通用 harness 是可行产品路线、对本次已确认需求不合格。DSH 原生 hook/context 观察支持其可行性，见 [DSH 研究](../../../research/legacy_backup/agent-loop-events-and-hooks/notes/dsh.md)。

## 2. Bounded compatibility adapter

- **前提/边界：**外部字段逐项映射到封闭内部 API；不支持与降级必须可查，命令 runner 没有领域写面。
- **兑现与实现：**Claude/Codex config loaders → asset index → command runner → site adapter；六种状态/控制效果、唯一 completion 的 `fieldEntries[]`/`presentationEntries[]`、Stop cap 与卸载 drain 覆盖 PF-025。
- **失败/处置：**需持续跟踪上游目录，命令进程与资格重验复杂；插件不 ready 时 fail closed。当前推荐，仍待接受和实现。

## 3. 外部语义权威化

- **前提/边界：**把外部 hook 的 input/result rewrite、continue/stop 与直接通知作为领域命令；需为每个字段建立授权、事务和恢复契约。
- **兑现与实现：**在 Session/Tools/Run 内建兼容事件及写面，可达到高表面兼容；Claude Code/Codex 事件/输出形状证明该路线真实存在，见 [Claude Code](../../../research/legacy_backup/agent-loop-events-and-hooks/notes/claude-code.md) 与 [Codex](../../../research/legacy_backup/agent-loop-events-and-hooks/notes/codex.md)。
- **失败/处置：**会让外部配置越过既有 owner，改变已耐久事实并造成不同宿主下语义分裂。除非产品明确选择外部协议为系统权威并重写领域契约，当前淘汰。

三者分别是“不兼容但原生”“有限适配”“外部协议权威”，并非参数变化或陪衬。
