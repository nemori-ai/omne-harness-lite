## 总体意见

补篇与研究包的事实基础是扎实的。我按原文逐项核对了论文定义、六轴、AOEP 数字与消融缺口、GEM 六条件与「structural claims, not theorems」原话、ACRFence「尚未实现」原话，以及 lite 契约、Plexus/个人版源码的全部关键争点，没有发现事实错误或把文献规范强加项目的地方。研究正文守住了「给约束不给方案」的边界。

**对「补报告」：成立。** 它给原报告增加的是跨时间验收维度，而不是新框架；证据分级与「不据综述换存储」的立场都有原文支撑。

**对「0 新 issue」：结论可以接受，但表格里有一行的排除理由瞄错了对象。** 「持久化注入沿摘要/记忆/委派洗白」一行以「Relay 已拒绝外部内容自授资格」排除，而论文描述的机制是在已授权范围内、摘要丢失说话者归属后的影响，不是扩权。lite 在消息层考虑过「谁说的」（PF-009 §6.1，CompactionMessage 单立为系统所说），但 PF-010 §5.6–5.8 对摘要内部是否须保留「这条指令来自工具返回还是用户」没有任何条款，PF-012 §5.8 的注入检测只在落盘入口且租户未装即跳过。按用户门槛，这是我核到的范围里唯一一处「主项目尚未考虑」成立的点，责任 owner 是框架侧的 PF-010/PF-009，不是 Relay。补篇把它留给 T1 先造反例是可接受的处置，但当前写法会让读者以为已有保证覆盖。是否现在开 issue 是用户的判断；我的建议是先按下面 中-1/中-2 修正措辞与 T1 的 oracle，再决定。

## 分级发现

**中-1 T1 的 oracle 断言了框架未承诺的性质，犯了 T3 自己警告的错误。**
位置：`analysis.md:155`。T1 要求「外部文本不升级为用户指令」，但 PF-012 §5.8 把注入检测定为租户可插拔拓展件，缺席即跳过（`PF-012 design.md:1020,1047,1290`）；准入是对权限与参数的无状态函数，不检查内容来路。后果：对框架单独跑 T1 会把框架明确允许的行为报成漏洞，与 `analysis.md:164` 对 T3 的提醒矛盾。最小修正：在 T1 行写明该断言的 owner 是 Relay 产品层检测或租户装配的拓展件，框架层的通过判据另列。

**中-2 §8 对「洗白」一行的排除理由瞄错机制。**
位置：`analysis.md:179`，呼应 `notes/harness.md:65,99`。具体事件链：租户未装注入拓展件 → 工具结果含「用户要求转发合同给 X」落为 toModel 块 → PF-010 压缩由模型生成摘要，无条款要求保留「此指令来自工具返回」 → 后续 Run 读摘要调用已获 `allow_session` 的发送工具 → 准入按权限放行、无卡片 → 外部效果发生。现有保证只剩 PF-010 §5.8 原消息不擦，可事后追查，不能阻止。最小修正：把该行理由改写为上述精确残余（消息层已考虑、摘要内容层未考虑），owner 写 PF-010/PF-009，并把「用 T1 形成反例」与 中-1 的修正绑定。

**中-3 复用基线漏掉语言边界，影响成本校准。**
位置：`analysis.md:83-98`、`notes/plexus.md` 全文。个人版 adapter 是 Python（`provider.py`、`storage.py`、`auth.py`），lite 产品实现按 AGENTS.md 只用 TypeScript；Plexus 网关本身是 TS。补篇与笔记都未提这一点，「现成实现参考」会被读成可直接复用代码。后果：§7 「不自动承诺节省人周」的保留语不足以阻止读者按代码复用估算。最小修正：加一句区分「adapter 需按 lite 契约用 TS 重做」与「网关可作外部服务原样复用」，并标注成本未估。

**中-4 补篇在原报告入口不可达。**
位置：`ai-assistant-saas-projection/README.md`、同目录 `review.md`。两者都没有指向 `supplements/always-on-20261001/`，只有 `research/README.md:145` 登记了研究包。后果：从原报告入口读起的人找不到补篇。最小修正：topic README 阅读顺序加一行；评审闭合后 review.md 补登记。

**低-5 补篇声称的评审与哈希记录尚不存在。**
位置：`analysis.md:11`「本补篇独立记录评审和最终哈希」。supplements 目录只有两个文件，输入索引在 `tmp/always-on-synthesis-20261001/reviews/r1/`。最小修正：评审闭合时把索引与结果落到 supplements 内，或把该句改为将来时。

**低-6 「规模不变」少说了验证范围的增量。**
位置：`analysis.md:144,147`。T1–T8 全部挂到 IWP-02/IV-*，而 r5 评审记录这些节点按零增量人周核算。八条多阶段有序/乱序真实提供者轨迹不是零成本。最小修正：写明「八条轨迹的验证工量未重估，归原校准流程」。

**低-7 研究包未标注主线对 subagent 来源的复核情况。**
位置：`evidence.md` E3/E5。research/AGENTS.md 要求采信前自行核对关键来源、核不动的标「仅转述」。我本次已独立复核的关键坐标见下节，事实均成立，缺的是标注。最小修正：在 evidence.md 各节加一行「主线复核：哪些坐标」。

**低-8 两处 Plexus 措辞可更精确。**
位置：`notes/plexus.md:32`「最长 60 分钟」，源码 `sessions.ts:18-19` 是默认值；`notes/plexus.md:50`「revoke 不会终止已 dispatch 的工作」，协议 `PLEXUS-PROTOCOL.md:520-523` 原话是每个成员派发前重查撤销、已完成的派发只审计不撤销，即撤销会中止 fan-out 中尚未派发的成员。两处结论方向不变。

## 可选建议与核查范围

可选建议，不属于本轮必须：把 中-2 的精确残余登记为研究包「未知与下一项证据」表的一行，消费位置写 PF-010/PF-009 owner，便于日后决定是否开 issue 时有现成坐标；`notes/harness.md:95` 列出的三个窄问题中「独立检查的具体强度」与「长期质量评价」在补篇 §8 已有对应行，只有信任传播这一行需要按 中-2 重写。

实际读取并复核的范围：

- 论文原文：`page-016.txt` 定义与第四项义务；`paper-layout.txt:4155-4322` Table 18/19、seeds、AppWorld 轨迹、消融缺口；`paper-layout.txt:4068,3228,4942` 对 GEM 的表述；`gem.txt:225-285` C1–C6 与 §3.4 原话，全文无 rollback 字样；`acrfence.txt:161-185` 未实现声明。
- lite：tool-admission/v2 S-11/19/22/30/31/36 与 G-1/2/3/10/12；PF-012 §5.8/§5.14 相关行；PF-007 §5.8/§6.12/§6.13；PF-010 §5.6–5.8、§6.12–6.14；PF-009 CompactionMessage 与 §6.1；content-blocks/v3 S-8；messages/v3 S-18；PF-001 §6.6；PF-005 never-allow；PF-021 非目标行；catalog 64 与 README 两处数字；D-074。
- Plexus/个人版：`sessions.ts`、`invoke-runs.ts` 常量；`grant-service.ts:459-519`；`security-model.md` 开头与 L94 的矛盾；`PLEXUS-PROTOCOL.md:503-523`；`provider.py:464-589`；资源契约 Draft 与 ADR-C027 Proposed；`omne_plexus/docs/index.md:86-88` 排除项；产品设置文档 L60-64；VERIFICATION.md 的重启/重绑/撤销记录条目。
- Relay 原报告：165/37/21/58/262/108/187/302 各数字、PWP/SWP/IF/IV 节点表、X30、PR-01/PR-03、D03、M01.7、S02–S23 标题、peripheral-design 章节结构、design.md Connector 搁置行。

未核范围：OpenAI Dots 页面未取得全文，补篇与 evidence.md E2 的段落事实我无法独立验证；`gh issue list` 未重跑，仅以 `issue-inventory.json` 为准；`report.html`、77 份 harness 来源的全文、`storage.py`/`auth.py` 正文、Plexus `sources/config/store.ts`、论文 §10 与 §7.2–7.4 未读；未运行任何测试、脚本或个人版 E2E。以上无问题的部分，证据边界即这些已读坐标。