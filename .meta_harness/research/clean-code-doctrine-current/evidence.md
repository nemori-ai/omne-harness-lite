# 可复核的来源与观察

版本 token（上游换版本时 grep 这些）：Clean Code 2e `9780135398579`（InformIT `Published Oct 8, 2025`）；样章 PDF 2 425 364 字节；
swarm-forge `f4f5fbca`（main，2026-09-04）与阈值提交 `27f596ad`（2026-09-02）；uml-viewer 最新提交 `017168235d`（2026-09-30）；
negative-test-experiment 推送 `2026-08-17`；aposd-vs-clean-code 推送 `2025-04-15`；X 帖按 status ID；视频按帖 ID；GitHub API 快照 `2026-09-30`。

原样字节在 [sources/](sources/)，逐组来历见 `sources/provenance.json`，校验：

```bash
cd .meta_harness/research/clean-code-doctrine-current/sources && sha256sum -c SHA256SUMS
```

记录分五组：**V** 作者一手（X 帖、出版物、GitHub、视频）、**B** 著作线子代理取回的出版物与博文（主会话未逐句核）、**S** 第三方转述、**L-C** 独立批评、**L-E** 实证研究。
V 与 L 组的逐条内容在 [notes/](notes/)；本页给每组的取得方式、立场、支持范围与复核状态，不复制原文。

## V-A X 原帖

- 消费对象：research.md C-1、C-2、C-6、C-7、C-10、C-11、C-13 至 C-20 与演变表。
- 来源与精确修订：`@unclebobmartin`（user id 9505092）status ID；逐条清单在 [notes/author-primary.md §A](notes/author-primary.md)（主会话 44 条）与 [notes/x-timeline.md](notes/x-timeline.md)（子代理 129 条）。
- 来源立场：作者自述；多数是回复帖，语境是被问到的问题（例如 2044114698451476492 回复的是「500 行 Claude PR 怎么评审」）。
- 取得方式：`https://api.fxtwitter.com/i/status/<id>`（返回 created_at UTC、长帖全文、回复对象）与 `cdn.syndication.twimg.com/tweet-result`（长帖截断）；x.com 直连需登录，xcancel 451。JSON 原样在 `sources/fx/`、`sources/fx-*.json`、`sources/subagent-raw/tw_*`；时间线翻页 846 条在 `sources/subagent-raw/tl/`。
- 环境与前提：FixTweet 是第三方只读代理；本轮 44 条与另一独立汇编（xdlkc，2026-08-24 拉取）逐字一致，未与登录后的 x.com 页面直接比对。
- 实际观察：见 notes。关键纠错——「AI 让原则 more true than ever」不是他的话（2104655549833032028 引用 @greg_horvay）；07-02 帖早于 07-23 帖；「不读代码」帖首见 04-14 而非 07 月。
- 支持范围：支持「他在某日说过什么」；不支持「他一贯如此」——同一话题他在 2026 年内多次改口（C-16、C-19）。2025-10 至 12 月接口取不到，可能有遗漏。
- 后续核对：他删帖或编辑（syndication JSON 显示 `isEdited:false`）会使 ID 内容变化；复核时重取并比对 `sources/fx/`。

## V-B 出版物、博客、辩论

- 消费对象：C-1 至 C-12。
- 来源与精确修订：V-B0 InformIT 纸书页目录；V-B1 样章 PDF（前言、导言、第 3 章、索引）；V-B3 `johnousterhout/aposd-vs-clean-code` README（114 599 字节）；V-B4 `unclebob/cmuratori-discussion/cleancodeqa.md`（87 867 字节）；V-B5/B6 博客 "Solid Relevance" 2020-10-18、"Too Clean?" 2018-08-13；V-B7 博客索引；V-B8 cleancoder.com 首页。逐条核对表在 [notes/author-primary.md §D](notes/author-primary.md)。
- 来源立场：作者自述（V-B3、B4 是与批评者的对谈，双方原文）。
- 取得方式：curl 原样落盘；PDF 用 pypdf 抽文本，页码按书内页码。
- 实际观察：第二版 37 章四部分 + 辩论附录；p.41 "not strict laws"；p.xxvi "a bit more confident"；p.42 "handful of lines"；p.68 "cognitive price"；p.69 Future Bob 对 Grok3；辩论 L614、L645、L1242、L2208、L2286；问答 L9、L13、L98、L102。
- 支持范围：支持第二版的结构与样章可见段落；**不支持**第 17 章、第 14 章、第 5 章正文——未读。第二版出版日期三种说法（纸书 10-08、电子书 09-30、版权 © 2026）照实并列。
- 后续核对：出版社样章可能更换；比对 SHA256。

## V-G GitHub 仓库

- 消费对象：C-3、C-7、C-8、C-10、C-12、C-15、C-17 至 C-20。
- 来源与精确修订：`api.github.com/users/unclebob/repos?sort=pushed`（2026-09-30）；swarm-forge `main` 宪法三篇（`f4f5fbca`）、`six-pack` README、提交 `27f596ad` 的 diff；negative-test-experiment 五份文档；uml-viewer README（master）与提交列表；Acceptance-Pipeline-Specification README 与树；crap4go／crapper README（CRAP 公式）；AIR-J README。清单在 [notes/author-primary.md §B](notes/author-primary.md)。
- 来源立场：作者自述；实验文档由 agent 起草（"Abstract written by grok"），提交人是他。
- 取得方式：raw.githubusercontent.com 与 GitHub API；主会话读过全文。
- 实际观察：宪法把 CRAP／变异／DRY／APS 写成必装工具并禁自造替代；09-02 阈值 6→10 且拆分依据改为职责；实验八棵树校验和互异，"CRAP buys coverage and spends cleanliness. It does not improve design."；uml-viewer 与 Grok 耦合、依赖方向违反标红。
- 支持范围：支持「他在某日实际配置了什么、测出了什么」；不支持这些工具在他之外的项目上的效果。实验是单游戏、单语言、8 次、agent 自评。
- 后续核对：swarm-forge 与 uml-viewer 持续提交（09-29、09-30 仍有）；复核时比对提交 SHA。

## V-V 视频与播客

- 消费对象：C-7、C-13、C-14、C-16、C-18、C-19。
- 来源与精确修订：V-V1 2026-09-12 帖 2098744156709441896（260 s）；V-V4 2026-09-21 帖 2102079838639038629（533 s）；V-V2 2026-04-20 帖 2046206145597972849（前 50 s，子代理转写）；V-V3 Kent C. Dodds 播客 2026-07-22（transistor.fm 官方逐字稿，`sources/subagent-raw/kent_*`）；V-R 26 条 Morning Bathrobe Rants（索引 `sources/rants/index.txt`，26 条转写全部在 `sources/rants/<id>.transcript.txt`，faster-whisper base/int8；要点在 notes/author-primary.md §C.3）。
- 来源立场：作者自述。
- 取得方式：mp4 由帖内 video.twimg.com 链接下载；faster-whisper 本地转写（small：V-V1、V-V4；base：V-R 批量）；mp4 未入库。YouTube 字幕接口对云 IP 封锁，2026-08-19 访谈未转写。
- 实际观察：V-V1 "three or four hours … 40 minutes … apparently the harness is doing the damage"、"keep crap below 12 … kept crap below six anyway"、"left scars"；V-V4 "I usually don't [see the code]"、一个模块覆盖率为零未被门禁发现。
- 支持范围：支持他口头说过这些话；转写可能误拼专名（"grock"）；数字与他同期文字帖一致。
- 后续核对：视频可被删除；转写稿与帖 ID 一并保存。

## B 著作线子代理取回的出版物与博文

- 消费对象：C-1、C-3 至 C-12 中标「仅转述」的引文。
- 来源与精确修订：原报告 [reports/2026-09-30-first-round/notes/books-subagent.md](reports/2026-09-30-first-round/notes/books-subagent.md)，105 个 URL（出版社页与样章 27、博文 51、GitHub 18）；编号 S01–S122 指该报告 §0 清单。原始抓取在 `sources/subagent-raw/`（art_、informit、agile、cc_、aposd_vs_cc.md.txt 等；Markdown 原件均以 .md.txt 存放）。
- 来源立场：作者自述与出版社文案，报告内逐条标注。
- 取得方式：子代理 curl／WebFetch；主会话只核了与 V-B 重叠的部分（2e 目录、样章、辩论、Muratori、两篇博客）。
- 支持范围：其余引文视为「仅转述」：Clean Coder、Clean Agile、Clean Craftsmanship、Functional Design、We Programmers 的前言与目录，2011–2023 博文。
- 后续核对：需要时按报告 URL 重取。

## S 第三方转述

- 消费对象：C-11、C-15、C-18、C-19 中标 S 的内容；C-14 的纠错。
- 来源与精确修订：S-1 `xdlkc/uncle-bob-harness/research/interview-core.md`（2026-08-24，对 08-19 访谈的逐条整理，自称 "Paraphrased coverage"，快照哈希 `72e04c65…`）；S-2 blog.alexrusin.com 2026-08-20；S-3 explainx.ai（2026-07）；S-4 xdlkc `adversarial-review.md`（对自建复现物的自审）；S-5 The Product Engineers Podcast 主持方摘要（2026-09-29）；另 startupfortune、mvark（2026-04）、raphamoura、akitaonrails、free_ai_guides 帖。原样在 `sources/`。
- 来源立场：S-1、S-4 是在按访谈造 harness 的第三方；S-2、S-3 是教程博客；mvark 中立综述；free_ai_guides 是营销号。
- 实际观察与冲突：五角色（无 architect）只见于 S-1/S-3；他本人帖与 Clean Coders 第 6 集是六角色；"Stryker" 只见于 S-2，他用自写工具；"Agents suffer from messy code … threshold" 是 S-2 改写，非原话；Booch 引文经 mvark 与 raphamoura 两份独立转述一致，原帖未取到。
- 支持范围：只支持「第三方这样转述」；与一手冲突处以一手为准，已在 research.md 标明。

## L-C 独立批评

- 消费对象：C-3、C-4、C-5、C-9、C-12、C-16、C-17。
- 来源与精确修订：28 条（C1–C28），逐条在 [notes/critics.md §1](notes/critics.md)，含批评者立场分类（独立 / 竞品 / 利益相关 / 同阵营）。
- 取得方式：子代理抓取；主会话抽核 qntm、Böckeler 两页原句（`sources/critics/`）。
- 支持范围：多数批评是设计推演与个人经验，无数据（notes 逐条标注）；Booch、Coplien 为二手转引。
- 后续核对：按 notes 中 URL。

## L-E 实证研究

- 消费对象：C-3、C-4、C-5、C-7、C-9、C-10、C-13、C-14、C-16 至 C-19。
- 来源与精确修订：45 条（E1–E45），逐条含样本、方法、原文结论、作者自述局限、来源等级，在 [notes/critics.md §2](notes/critics.md)。
- 取得方式：子代理抓取（arXiv、OpenAlex 摘要、PDF 全文）；主会话抽核 E1、E13、E21（17%）、E26、E37、E38（"cheat"）摘要页，其中 E38 的 76% 与「改测试」比例、E21 的 27% 未在抽核页面出现，仍标仅转述。
- 支持范围：每条研究的成立条件写在 notes；跨研究方向不一致处（函数规模、TDD、AI 生产率、AI 与质量）在 notes §5.1 与 research.md 对应结论中并列，不裁决。
- 后续核对：按 notes 中 URL／DOI。

## 三路之间的查重与冲突处理

- 查重：swarm-forge、negative-test-experiment、Ousterhout 辩论、Muratori 问答、2044114698451476492 等来源被两到三路同时给出，只算一份证据，以主会话复核件为准。
- 冲突：著作线称「访谈五角色」为待验证，言论线证实本人帖为六角色；批评线称「40 分钟对 3–4 小时」未核实，主会话以视频转写证实；批评线把 Booch 定在 4 月，与 startupfortune 的 7 月说法冲突，采 4 月（两份独立转述一致、且引文回应的是 4-14 帖）；言论线纠正了任务线索里「2025-11 帖」「2025-12 五 agent」「Stryker」三处。
