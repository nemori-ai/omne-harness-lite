# Skills、roles 与工作区入口的独立复核

评审者：独立只读 architecture-reviewer `/root/layout_review`。范围为三个迁入 skills、八个角色源与公共契约、
重写的 AGENTS.md、proposals/decisions 入口及模板；后台外部 harness 研究不计入此次完成范围。
原文件仅用于明确的历史比较，运行时依据为新工作区及用户要求。

## 发现与处置

初次复核未发现资源缺项、模型/权限配置变化或 reviewer 职责越界，提出一项必要修订：
Claude 适配页与 worktree skill 的原生隔离段仍固定要求 `.worktrees/`，与明确容器输入冲突；
CLAUDE→AGENTS 引用也不应作为独立分发后的默认事实。

已修改 canonical 源，再经新暂存目录比较、校验原产物哈希后刷新双端：隔离核对实际采用的容器及拓扑，
指令继承从工作区核实；邻近提交指导同时明确 worktree 所有权本身不授予提交权限。
改动记录归各 skill 的 `.design/migration.md`。

评审读取时新入口试用结果尚未落盘，曾指出证据缺口；后续提供独立的
[入口试用记录](meta-agents-probes.json)与[说明](meta-agents-rewrite.md)，其输入和重写后 AGENTS 哈希
与此前[角色试用](role-migration-probes.json)区分，没有把旧上下文结果冒充新入口证据。

## 窄范围复核结果

复核结论：没有剩余必要修订。实际容器/继承输入与提交授权边界已纠正；新入口的五题记录明确
输入、摘要来源及未覆盖范围，没有外推原生加载、权限强制或长期模型行为。

两轮均只读，未运行测试、形式工具或继续委派。此记录是主 agent 对返回意见的整理，
评审结论不是接受/发布授权；静态生成结果归[检查记录](role-migration-checks.json)，行为观察保留各自范围。
