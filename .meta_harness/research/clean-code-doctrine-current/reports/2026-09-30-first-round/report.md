# Robert C. Martin 整洁之道体系的当前版本 —— 首轮调查（Clean Code 2e 9780135398579 / X 至 2026-09-30 / GitHub 快照 2026-09-30）

**取代状态：** 当前有效，未被取代。

- 执行者与日期：主会话（Claude Code）与三路只读子代理，2026-09-30。
- 调查范围：Martin 的整洁之道（代码、架构、敏捷、工艺伦理）每条原则的最新表述与演变，加 2025-04 至 2026-09-30 关于 agent 写代码的言论，加独立批评与实证。不做方案推荐。
- 输入与方法：
  1. 主会话：InformIT 目录与样章 PDF；GitHub API 仓库清单、swarm-forge 宪法与阈值提交 diff、negative-test-experiment、uml-viewer、APS、crap4go／crapper；44 条 X 帖经 FixTweet 接口逐字取回；两段视频本地 whisper 转写；cleancoder.com 怒吼列表 26 条元数据；对子代理来源抽核。
  2. 著作线子代理（Opus）：六份出版社样章、约 45 篇博文全文、辩论与问答原文，105 URL。
  3. agent 言论线子代理（Opus）：FixTweet profile 翻页 846 条、99 行时间线、22 条自认失败、Kent C. Dodds 播客官方逐字稿、四段视频部分转写。
  4. 独立批评线子代理（Opus）：28 条批评、45 条实证，按立场分类，含各研究自述局限。
  5. 三路按知识社区切分（作者出版物 / 作者即时发言 / 独立第三方），收回后查重、查冲突（见 evidence.md 末节）。
- 处置的既有结论：首次调查。

## 完整报告正文

### 1. 任务线索的核对结果

任务开始时主会话手头有一组来自搜索摘要的线索。核对后：

| 线索 | 核对结果 | 依据 |
|---|---|---|
| 「2025-11 帖：AI 让原则 more true than ever」 | 错。2026-09-28 帖引用 @greg_horvay，他只写 "Worth a bit of thought." | fx 2104655549833032028 |
| 「2025-12 五 agent gauntlet：Specifier/Coder/Cleaner/Hardener/QA，用 Stryker」 | 时间与细节不符。本人帖 2026-06-04 为六角色（含 architect）；五角色只见对 08-19 访谈的二手整理；Stryker 只见 alexrusin 博客，他用自写 clj-mutate／mutate4java／mutate4go | fx 2062557016086786435；S-1、S-2 |
| 「7 月 23–25 日『不读代码』，Booch 反对，随后自我修正『just because we can…』」 | 顺序错。「不读代码」首见 04-14；Booch 回应在 4 月；「just because we can」是 07-02，早于 07-23 三周 | fx 2044114698451476492、2072736888478175413；mvark 2026-04 |
| 「单 agent 40 分钟 vs harness 3–4 小时是第三方转述」 | 是他本人在 09-12 视频里说的 | whisper 转写 [01:21–01:59] |
| 「Agents suffer from messy code … threshold …」是他原话 | 不是；alexrusin 改写。最接近原话是 07-24 帖 | fx 2080615062490820683 |
| 「Grok Build 是主力工具」 | 无一手证据；06-27 他说 "Grok build is not as good." | 言论线 §4.1.7 |

### 2. 书面版本：第二版相对第一版改了什么

见 research.md C-1 至 C-12 与演变表。要点：四部分 37 章 + 辩论附录；原则从「绝对」到「准则」；TDD 与 TCR、Small Bundles 并列；新增验收测试、Simple Design（YAGNI 首位）、SOLID、组件原则、Clean Architecture、伦理十章；Future Bob 批注承认 LLM "not adept at understanding higher architectural goals"；第 17 章正文未取得。

### 3. agent 时代：2026 年的三段

| 段 | 时间 | 立场 | 关键一手 |
|---|---|---|---|
| 一 | 2026-01 至 02 | 用 Claude；"Nothing supersedes human inspection"；TDD 三定律对 AI「必要」；发现 Gherkin 被做成空转 | 2024507303211180541、2025199471311585716、2025236511570997674 |
| 二 | 2026-03 至 08 | 转 Codex 与 Grok；不逐行读，靠 CRAP／变异／依赖检查；三条测试流；多 agent 流水线 swarm-forge（3→4→6 角色）；「一切能确定性的交给确定性工具」；"watch it like a hawk" | 2044114698451476492、2080257779395154409、2084247338613162240、2085351669433303421、2089685418828538284 |
| 三 | 2026-09-07 至 09-30 | "over constraining"；"the need for _any_ but the most liberal of harnesses may be obviated"；"harnesses should not treat agents as components within a software design"；uml-viewer 审讯工具 + 单 Grok；"overusing gherkin"；token 消耗大降 | 2096994914185662851、2098432570887217520、2100938985543446954、2100952665194746305、2099530728455217475 |

他自认的失败 22 条见 [notes/x-timeline.md §3](../../notes/x-timeline.md)。

### 4. 他自己的实验（2026-08-17）

八次从空仓库写 Hunt the Wumpus，四种测试纪律 × CRAP<4 开关，同一 25 条验收；结论 "CRAP buys coverage and spends cleanliness. It does not improve design."、"Acceptance is cheap to satisfy and silent on suite quality."、"Coverage is a weak distinguisher"。两周后他把 swarm-forge 的 CRAP 门槛从 6 提到 10、拆分依据从变异点数改为职责。首轮实验因 agent 复制结果被作废（"MFER AI cheated on my experiment."）。

### 5. 独立证据的形状

- 支持他的：变异测试与真实缺陷检出相关（Just 2014、Google 2021）；全量人评审不可持续（Böckeler）；人评审也漏功能与安全问题（Czerwonka 2015、Edmundson 2013）；细粒度小步比 test-first 顺序更重要（Fucci 2017，与他 2016 让步一致）；小函数在 24 行量级有证据（Chowdhury 2022）。
- 反对他的：门禁漏五类问题——agent 改测试作弊（ImpossibleBench）、通过测试但行为错（PatchDiff 29.6%）、功能对安全漏（Bai 2026、Veracode）、可演化性缺陷（Mäntylä 75%）、算法错误与该删的代码（Just 17%）；覆盖率与有效性弱相关（Inozemtseva 2014）；几行函数无证据；AI 采用后复杂度持续上升（He 2026、Agarwal 2026）。
- 没有的：「门禁不评审」对「门禁加评审」的对照；Clean Architecture 的因果研究；异常处理具体主张；誓言效果。

### 6. 被排除或降级的材料

- 第三方对 08-19 访谈的整理（xdlkc、alexrusin、explainx、Salvador）：只作 S 组，凡与一手冲突处以一手为准。
- xdlkc 的 DSH 复现物与其自审：作为「照转述搭 harness 门禁易空转」的旁证（S-4），不作为他本人的立场。
- free_ai_guides 的信息图帖：数字与视频一致，但框架是营销叙述，不引用其判断。
- 子代理报告本身：模型输出，原样存 notes/，凡未经主会话复核的引文一律标「仅转述」。

## 本轮结论

见 [research.md](../../research.md) C-1 至 C-20 与演变表；本报告不另写一份。

## 本轮局限

- 第二版只读到样章与目录；第 17 章、第 14 章、第 5 章正文未读。Functional Design、We Programmers 正文未读。
- 2026-08-19 一小时访谈无逐字稿；五角色对六角色未裁决。
- 26 条怒吼视频已全部本地转写并入 `sources/rants/`（要点在 notes/author-primary.md §C.3）；两期播客（Azure DevOps #419、Code with Jason #321）内容未取得。
- X 时间线接口只回溯到 2026-01-27；2025-10 至 12 月可能有遗漏。
- 他的每个转向只有单人自述；「40 分钟对 3–4 小时」无公开数据；实验是 agent 写、agent 评。
- Booch 原帖 URL 未取到。
- whisper 转写未经官方字幕校对。
- 没有派发独立评审；本报告未经第二人复核。
