# 独立 method 目录退役

日期：2026-09-16。结论：可复用的架构设计与维护方法由 `harness-design-handbook` 自包含提供，
不再维护一个与 skill references 重叠的顶层方法目录。产品事实、模板和接受状态仍由各自 owner 持有。

## 内容处置

| 原内容 | 当前 owner 与处置 |
|---|---|
| 长期信息准入和唯一语义归属 | `canonical/references/information-packages.md` 已拥有完整判断；删除重复短文 |
| 研究→提案→决定→规格→兑现的状态边界 | `design-decisions.md`、`handoff.md` 与 `spec-evolution.md` 分别拥有选择、交接和传播；删除重复短文 |
| 需求确认、变化和可恢复来源 | `intake.md` 吸收冲突范围、非自动取代及长期来源边界 |
| 规格身份、冻结、升版和消费者传播 | `spec-evolution.md` 已完整拥有；删除重复短文 |
| 验证范围和反例归属 | `architecture/assurance/specification.md` 吸收反例分类；证明门槛继续归 `composability.md` |
| 可验收纵切与一次性计划边界 | `delivery-planning.md` 吸收计划、DAG、分工和进度的临时归属 |
| 防御辅助简化或退出 | `agents/evaluation/developer-model/` 拥有协议、采用边界和复核触发 |
| 外部 harness 设计治理研究 | 移至 `.design/research/harness-design-decisions/`，作为 skill 维护证据，不进入分发包 |
| 空 guide、proposals、decisions 骨架 | 没有独立消费者或正文，删除 |

没有把旧目录整体搬入 skill，也没有新建重复 governance reference。canonical 只增加会改变 agent 判断的
短规则；旧 P1/GATE 任务证据保持原始路径和哈希，只说明当时快照，不构成当前导航。

## 产品与模板边界

- `design/{family}/.templates/` 继续拥有该 family 的信息包写作资源。
- `design/` 继续拥有产品需求、研究、候选、决定、规格、提供者、装配和迁移关系。
- skill 的 `.design/` 只保存方法的来源、研究、修订和评估证据；它不分发，也不建立产品接受事实。
- 一次性交付计划、任务 DAG、worker 分工和实时进度继续放任务 `tmp/`。

三个需求页原先引用了未迁入的项目基线或方法路径。当前改为用各页 front matter 的产品来源元组固定谱系，
并链接 handbook 的需求处理方法；没有把产品确认事实复制进 skill。
