# 常设用例集

每个子目录是一个**流**——一个角色做一种事——的用例与判定依据，按现行角色名寻址，改角色正文、换模型钉值、
升宿主版本之后拿来重跑。用例与判定标准随有效缺口维护；每次改变采用范围须复核并按原有规则升版。
实际派发、校准和原始执行结果只放本工作树 tmp。跑它们的那一套在[运行器](../harness/README.md)。

| 流 | 角色与判断 | 现状 |
|---|---|---|
| [design-review-expression](design-review-expression/README.md) | design-reviewer 判「表达」 | 两次签字已齐（判定方法签的是 subagent 判官）；还没有基线 |
| [design-review-choice](design-review-choice/README.md) | design-reviewer 判「选择」 | 同上 |
| [design-review-plan](design-review-plan/README.md) | design-reviewer 判「计划」 | 同上 |
| [developer-implement](developer-implement/README.md) | developer 在整仓检出里补完一个模块，程序判定 | 两次签字已齐（2026-10-02）；还没有基线 |
| [qa-acceptance](qa-acceptance/README.md) | qa 按十条标准验收一份构建，程序判定 | 同上 |
| [implementation-review](implementation-review/README.md) | implementation-reviewer 评审一份交付提交，判官判定 | 同上（判定方法签的是在这个流上校准过的 subagent 判官） |
| [tui-developer-implement](tui-developer-implement/README.md) | tui-developer 在整仓检出里补完一个终端模块，程序判定 | 同上 |
| [verification-write-tests](verification-write-tests/README.md) | verification-developer 为拿走了原有测试的模块写测试，程序用预置变异体判定 | 同上 |

八个流的基线何时跑、开跑前还差什么，由 [#72](https://github.com/nemori-ai/omne-harness-lite/issues/72) 跟踪。

负责人 2026-10-01 定：各流的完整基线不随用例集一起跑，统一放到研发方案的最后。在那之前，这些用例集可以用来对单次改动做有针对性的试派，
但没有基线可比。

`tui-debugger`、`product-design-drafter`、`product-design-reviewer` 的流还没有迁入或建立，
各自的一次性评估见[评估索引](../README.md)。

## 一个用例集里有什么

```text
flow.json        流的定义：角色、判断种类、宿主设置、副本怎样建、指标、材料清单与每份材料的真值
briefs/          每份材料的派发简报，{WORKDIR} 在运行时换成副本路径；implement 一类另有简报框架 _implement.md
materials/       整份放进副本的待审材料（如为评估写的施工计划）
stubs/           implement 一类：盖到副本上的桩文件，路径相对检出根
target-tests.json  implement 一类：每份材料的桩在位时失败的测试
                 （write-tests 一类的变异体写在 flow.json 每份材料的 task.mutants 里，简报框架是 _write-tests.md）
ground-truth.sh  acceptance 一类：在副本上逐条跑验收标准的真值脚本
calibration/     校准判官用：cases.json（每份报告的人工判定，反例怎样从真实报告删改而来）、
                 reports/（作为已知好/坏输入的报告文本）；比对输出归执行工作树 tmp
README.md        这个流量什么、量不出什么、当前方法、采用范围与局限
```

流分四类：评审类（`review`）由判官逐条判报告；`implement`、`acceptance` 与 `write-tests` 由程序在收录运行时判副本，没有判官，
它们的副本是装好依赖的整仓检出（见[运行器](../harness/README.md#整仓检出一类)）。

评审类的流里，一份**材料**是一次派发的待审对象，分三种：

- **种入的**：在一份真实材料上改几处，每处是一条已知的缺陷。种入的文字写在 `flow.json` 里，
  必须在明确案例夹具的原文里恰好出现一次，`make test` 里有一条测试守着。
- **真实的**：具有明确缺陷的待审稿片段，连同判定所需的规范和上游事实保存在最小案例夹具中。
  `fixture` 指定输入，`required_inputs` 列出必需文件；缺陷真值和已知问题归该案例，不恢复历史设计树。
- **对照**：不种入的材料。它上面没有「应当被报出的问题」，量的是评审者在没有种入时报多少阻断。

真实材料不是没有毛病的。每份材料另有一张**已知的原有问题**表：评审者报出它们不算抓到，也不算新的阻断；
表外的阻断发现单独计数，交人看过之后归进这张表（成立、不成立或属于另一种判断），用例集升版本。

## 规矩

- **两次签字之后才跑评估。**用例由负责人看过并认可，判定方法由负责人看过并认可；签字记在 `flow.json` 的 `signoffs` 里，
  带用例集的版本号。版本一变签字失效，运行器拒绝准备运行。判定方法那一条另写明是给哪个判官签的（模型与规则哈希），
  换一个判官要重新校准、重新签。整轮的用量与用时按试跑实测报给负责人，同意之后才跑。
- **模型只由主会话派 subagent 来跑**，角色与判官都是；不起无界面的宿主进程。做法见运行器说明。
- **真值不进被测角色看得到的地方。**运行用的工作副本不含本目录。整仓检出一类的角色有 shell，仓库与模板里就有答案，
  所以要从仓库之外的会话派发，见运行器说明。
- **改用例升版本，不原地改。**不同版本的结果不放在一起比。
- **材料钉在主线上够得着的提交。**本仓库按 squash 合并，分支上的提交合并后会够不着；`make test` 里那条测试在够不着时会失败，届时改钉。

## 什么时候跑

改了某个角色的正文、它内联的共享正文、它读的判据页或它依赖的工具输出；换了它的模型或档位；宿主升了版本。

| 改了什么 | 跑哪些流 |
|---|---|
| `design-reviewer` 的正文 | 三个 `design-review-*` |
| 手册 `references/review/` 的某一页 | 那一种判断的流（`expression.md` → `design-review-expression`，另两页同理） |
| `developer` 的正文、`developer-contract.md` | `developer-implement` |
| `qa` 的正文 | `qa-acceptance` |
| `implementation-reviewer` 的正文、`implementation-review-checklist.md` | `implementation-review` |
| `tui-developer` 的正文 | `tui-developer-implement` |
| `verification-developer` 的正文 | `verification-write-tests` |
| `engineering-taste.md`（有流的六个角色都内联它） | 每个角色至少一个流；改的是 TS/JS 专节时以 `developer-implement`、`tui-developer-implement` 与 `implementation-review` 为主 |
| 某个角色的模型钉值或档位 | 该角色的全部流；流里写的模型与档位同步改，用例集升版本 |
| 宿主（Claude Code）升了版本 | 每个角色至少一个流 |
| 判官的规则文本，或换判官模型 | 不是跑流：先重新校准（`calibrate-*`），判定方法重新签字，之后的结果才可比 |

**其余角色还没有常设用例集**：`tui-debugger`、
`product-design-drafter`、`product-design-reviewer`。改了它们，按[角色说明](../../roles/README.md)里的办法做一次试派，
并对照它们各自的一次性评估记录（见[评估索引](../README.md)）；别拿上表里的流代替。

跑之前先 `make role-eval ARGS="verify <用例集目录>"`（不调用模型），再按运行器说明跑一个新的变体，与基线逐用例比。
改过角色的源之后要重编生成物并**开一个新会话**再派发，否则派到的还是会话开始时加载的旧定义。
比出来的差小于该流说明里写的噪声范围时，结论是「看不出变化」，不是「没有变化」。
