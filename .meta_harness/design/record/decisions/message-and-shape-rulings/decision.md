# D-038：块 D 与两块运行时的数据形状——十九处分岔的裁决

入口与准入核对见 [README](README.md)。本文只记**裁决原话、取哪一边、落到哪份契约**，不复述形状本身。

## 裁决原话与含义

原话逐字；「含义」是主线当场向产品负责人复述并得到「其他的没问题」确认的读法。落点写契约坐标，契约未接受前都是 candidate。

### 追加要求三条

| 编号 | 原话 | 含义 | 落点 |
|---|---|---|---|
| 8a | 「CompactionMessage 带着覆盖可见性的记录，就可以了」 | 块上的两个可见性标注落盘后不改；压缩消息自带按块点名的名单，只覆盖「给模型看」一侧、只往不可见翻；模型可读性每次组装现算 | `data.content-blocks`（标注不变）、`data.messages`（CompactionMessage.silenced） |
| 8b | 「ModelResponse 也设计一版我看看吧，并且我们需要完整的响应体带着 input_tokens, output_tokens, cache_tokens 以及 cost_usd」 | 一次发出一条完整响应体；用量四项 token 与 cost_usd 随响应体走；拿不到记 unknown 不记零 | `data.model-response`、`data.call-accounts`（Usage/Cost，五个 snake_case 成员名照原话） |
| 8c | 「ToolCallAccount 这个确实有用，因为工具内部很可能调用其他的服务从而产生费用。改这次调用的目标模型 这个需要留口子，因为我们很快后面几版会通过 hook 来实现 model selector，到那时候一个会话就可以配置 默认主模型 和 可选路由模型组」 | 工具执行有自己的账，含内部调用的服务费用条目；拓展件结论加 `select_model`（只改这一次调用的目标）；「默认主模型 + 可选路由模型组」是将来项，本版只留口子 | `data.call-accounts`（ToolCallAccount、CostItem）、`data.loop-extension`（select_model）、`data.model-response`（route.selectedBy）；将来项归 PF-013 下次 rev |

### 十九处分岔

| 编号 | 原话 | 取哪一边 | 落点 |
|---|---|---|---|
| Q1 | 「Q1 文本块加来源标记」 | 文本块带 `origin`（模型 / 用户 / 工具 / 系统） | `data.content-blocks` |
| Q2 | 「Q2 带」 | 思考块带上游原样的 `opaque` 数据 | `data.content-blocks` |
| Q3 | 「Q3: 封闭 + 一个 extension 兜底」 | ReminderSource 是封闭判别联合，另加 `extension` 一种兜底 | `data.messages` |
| Q15 | 「Q15：『别的会话捎话』『定时到点』两种要做成 SystemReminderMessage，工具等待态的答复要根据是否是后台来定（虽然目前我们应该只定了要等待答复的工具只能阻塞在前台，但未来未必，总之就是真实的 tool result 用哪个，是取决于是否已经有占位的 ToolMessage 了，比如切后台），其他的没问题。」 | 两种提醒来源进 SystemReminderMessage；真实工具结果落成 ToolMessage 还是 SystemReminderMessage，取决于是否已有占位的 ToolMessage——是判断不是按工具类型的表 | `data.messages`（来源枚举）、`capability.tool-execution-runtime`（判断） |
| Q4 | 「Q4: 生产者给」 | 到达事件的 `index` 由生产者给，装配器校验 | `data.arrival-events` |
| Q16 | 「Q16: 能」 | 整体替换模式的块可以装整交内容（图、文件） | `data.arrival-events`；PF-009 rev 7 §5.5 措辞已改 |
| Q17 | 「Q17: 进」 | BlockHead 带可选的 `presentation` 提示（本版值集未定） | `data.arrival-events` |
| Q18 | 「Q18: 已发出的帧通过装配器不会落盘成持久化的 message 吗」→ 三条路解释后：「在途状态由运行时持有，不进日志」 | 拼到一半的那份是在途状态，由运行时持有，不落日志、不成消息 | `capability.stream-assembly`；PF-009 rev 7 §9.2 |
| Q5 | 「Q5 一份 schema 带判别字段」 | 多命令工具在模型面是一个条目，`input` 由各命令生成、带 `command` 判别 | `data.tool-definition` |
| Q6 | 「Q6 定义给」 | 设置项与执行权限的默认值随工具定义走，各层只配值 | `data.tool-definition`、PF-002 |
| Q8 | 「Q8：只按装配顺序，现在不搞复杂」 | 同一位置多件拓展件按装配清单顺序，本版无 `order` 设置 | `data.loop-extension`、`capability.loop-extension-runner` |
| Q9 | 「Q9：没错」 | rewrite 只许改 subject 里还没落盘的那一样 | `data.loop-extension` |
| Q10 | 「Q10：运行时只认统一的」 | 运行时只认统一的 ExtensionInput/Output；Claude Code 与 Codex 的 hooks 经一件 compat 拓展件翻译 | `data.loop-extension`（implementation.kind）、`capability.loop-extension-runner`（映射） |
| Q19 | 「Q19：暂时就这些加 select_model」 | 结论集合闭合：observed / inject / rewrite / veto / stop / retry / ask + select_model | `data.loop-extension` |
| Q11 | 「Q11 拒建」 | 自建档案与官方档案撞路由名，拒建 | `data.model-profile` |
| Q12 | 「Q12：统一覆盖好各种常用的比如 reasoning effort、temperature、seed 的参数让 model profile 可设置，各 model adapter 自己解析处理」 | 档案带统一请求参数词表，各家 adapter 翻译，不认的项留痕 | `data.model-profile`（ModelRequestParameters）、`data.model-response`（droppedParameters）；PF-013 rev 8 属性表已加「请求参数」 |
| Q13 | 「Q13 拆两项」 | 缓存 token 拆 `cache_read_tokens` / `cache_write_tokens` | `data.call-accounts` |
| Q14 | 「Q14 留」 | 上游原始响应留附件存储，保留期作设置项 | `data.model-response`（raw）；保留期归 PF-002 那套设置 |
| Q7 | （随 Q5/Q6 一并确认「其他的没问题」） | 工具定义的六项可选声明按 PF-006 §5.3 原样 | `data.tool-definition` |

## 理由与保留前提

- **为什么按章节逐节裁而不整批**：产品负责人原话「待我拍的，按文档的章节顺序，一块一块来讨论吧」；每节的裁决建立在前一节已定的形状上（例如 Q15 的判断依赖 Q3 的封闭来源）。
- **保留前提一**：Q15 里「要等待答复的工具只能阻塞在前台」是当前产品限定，原话已明说「未来未必」；契约把「真实结果落成哪种消息」写成判断而不是表，正是为了这条将来放开时不改契约。
- **保留前提二**：8c 的「默认主模型 + 可选路由模型组」尚无词条与产品正文；本版 `ModelProfileRef` 定成可复用的引用值，不为「一组」另立形状。产品正文补上时再出契约新版。
- **保留前提三**：Q12 的统一词表本版收八项；加一项 = 契约新版本。
- **本决定不含**：主线为起草补的推导（如不透明标识不跨契约 `$ref`、占位原因加 `run_cancelled`、参数解析失败的落法、PF-012 I-11 收窄、块 A 的 A1–A10）。它们记在任务区账本 `tmp/assets-runtimes/pending-user-rulings.md`「已自决」栏，**未经产品负责人签字**；契约引用它们时写「主线裁定，待确认」。产品负责人确认后另出决定。

## 取代与影响

- 不取代任何决定。在 [D-035](../message-and-stream-baseline/README.md) 三层起点之下给出具体形状取舍；回答 [D-033](../hooks-compat-baseline/README.md) 推迟到协议起草时的「运行时接口」一问（Q10）；G1–G11 逐项仍未由产品负责人裁。
- 产品侧影响已落：PF-009 rev 7（§5.5 措辞、§9.2 在途状态、来源表三行）、PF-013 rev 8（请求参数）。
- 契约侧影响：上列九份契约的「产品负责人裁定」依据行指向本文对应编号。

## 2026-09-24 修正

**只追加，上文一字不改。**产品负责人 2026-09-24 的两次当场裁定改变了本文两处分岔的读法；原话与推理的长期落点在各自的产品 topic，这里只记「本文哪一条由此失效或怎样读」。

| 编号 | 怎么了 | 依据 | 契约侧落点 |
|---|---|---|---|
| **Q11** | **撤回。**「自建档案与官方档案撞路由名，拒建」不再成立：档案的身份是（所在范围, 路由名），官方档案与自建档案同路由名并存、不相撞；同一范围里路由名仍唯一（含已撤回的，要再用它是把那一条恢复在册）；已撤回的档案可以恢复在册 | [PF-013 decisions 裁决 35–38](../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--档案的身份是所在范围加路由名列表每条带来源已撤回的可以恢复在册)（第 38 条明写撤回本文 Q11 的「拒建」）；PF-013 rev 10 | `data.model-profile` v1 S-3（改为同一范围内唯一）、S-10（加恢复在册转移）；`capability.model-profile-directory` v1 S-14、S-18、S-33 |
| **Q5** | **按 flat 读法读。**「一份 schema 带判别字段」读作：多命令工具在模型面前是**一个条目**，`command` 在里面、取值是一张一行一命令的紧凑清单，交给它的参数在模型面前不规定结构；**不按命令把完整参数展开到模型面前**（不生成 oneOf 判别联合）。作者带的完整参数用于系统校验与 `inspect`／`help` 答用法 | [PF-006 decisions 2026-09-24](../../../product/PF-006-tools-and-skills/decisions.md#2026-09-24--说明必填多命令工具在模型面前只有紧凑的命令清单一种样子)（产品负责人裁定 U-24-2）；PF-006 rev 19 | `data.tool-definition` v1 S-7（flat 形） |

**其余十七处分岔与三条追加要求不受影响。**本节不是新的决定：两条裁定的权威在上列产品 topic 的拍板记录里，本节只让读到 Q5、Q11 的人知道去哪里看现行读法。

返回 [README](README.md)。
