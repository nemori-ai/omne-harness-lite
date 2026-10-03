# Moonshot 两叶的空串文本段省略

2026-10-03，revision 1，candidate；待独立选择评审、待采用、待实施。沿 MR11／RT12／MP6／CB3 已接受语义修复提供者规划；不修改契约。实施路径为 `packages/model/pi-ai-transport`。

## 输入与依据

- 负责人把 issue #50 加进原会话方案，要求先真实路由实测再决定改不改；预算上限 5 美元。原会话最终裁定仅修改有拒收证据、且生产路径能发出这种消息的 Moonshot 两叶；本会话获明确授权继承工作树继续交付。
- 研究主题 `empty-text-part-acceptance` 的已写研究稿与原始探针记录已保全在本任务 `claude-evidence/draft-50/.meta_harness/research/empty-text-part-acceptance/`。落盘时研究归 `.meta_harness/research/empty-text-part-acceptance/`，本页的研究引用改成相对链接。
- 31 路由、两种图与空文本排列和纯图对照：Kimi K3、K2.7 Code 两种排列都 HTTP 400，供应商原文 `Invalid request: text content is empty`；纯图通过。GLM-5.3 Flash 也拒收，但现行本地计量器拒收图片，本次不改它。
- 费用 0.2320266 美元；账户入账观察与探针流报费用相等。拒收不额外入账是这次样本的观察，不提升为供应商的通用收费承诺。
- RT12 S-57：策略不得按路由前缀猜；相同输入和精确实现给同一规划，计量最终请求，planned 固定。MP6 S-29：定义、实现和配置分别有修订。CB3 允许文本空串，本次不改变消息输入值。

## 性质、承载与边界

| 性质 | 实现责任与保护点 | 证据义务 |
|---|---|---|
| 两条已证拒收的叶子不再发出有其他内容的空串文本段 | 精确官方定义绑定的规划规则，在各消息的最终 content 数组形成后执行 | MV5-1／MV5-2 |
| 仅空串消息不被删除，空白字符串保持原值 | 只有数组里存在至少一个非空串段才过滤；保留顺序与剩余段原值 | MV5-3 |
| 提醒与压缩标记仍显式存在 | 先加标记，再应用空串省略；不修改原消息 | MV5-4 |
| 其他叶子的字节不变 | 显式匹配当前官方定义的 modelId、definition revision、implementation name/revision 和 provider；没有前缀猜测 | MV5-5 |
| 计量、摘要、发送使用同一最终请求 | 正规化发生在图片准备和 projectInput 之前，沿既有 planned 所有权固定字节 | MV5-6 |
| 新行为有新实现坐标 | 两叶 implementation `mp4-18` → `mp4-19`，其他模型坐标不变；目录升到 3 并追加指纹 | MV5-7 |

本规则不涉及新的状态所有者、服务、事件、存储对象或同提交保证。纯规划没有网络和凭据访问；先前接受的图片准备、参数准入、失败优先级、plan 所有权和 Cordis 装配均沿既有设计。

## 精确适用表

| 模型 | provider | definition revision | 当前 implementation | 采用后 implementation |
|---|---|---|---|---|
| `moonshotai/kimi-k3` | `moonshotai/mxfp4` | `3` | `pi-ai:moonshot@mp4-18` | `pi-ai:moonshot@mp4-19` |
| `moonshotai/kimi-k2.7-code` | `moonshotai/int4` | `3` | `pi-ai:moonshot@mp4-18` | `pi-ai:moonshot@mp4-19` |

承载方式：规划器对 `official-models/moonshot.ts` 中当前声明的完整身份与 route 作显式对照，仅该精确表命中时执行；不从名称前缀或 provider 名推断。`ModelRoute` 的公开表示不增加隐含默认项或新成员。定义的能力与已有配置语义不变，所以 definition revision 仍 `3`；实现字节规则改变，所以 implementation revision 必须升。官方目录任何坐标变化均升 `officialCatalogRevision`，依现有规则 `2` → `3`。

## 规划规则

令 C 是一条 user、system、system_reminder 或 compaction 消息最终形成的 content 数组，包括已前置的提醒／压缩标识段。

1. `type === 'text' && text === ''` 是空串文本段。空格、换行和其他非空字符串不属于它。
2. 精确适用表不命中，C 原样保留。
3. 命中且 C 中至少存在一个不是空串文本的段，删除全部空串文本段，剩余段的顺序、值、角色与消息身份保持不变。
4. C 为空或全是空串文本段，原样保留；不删除消息、不改为空字符串、不创建占位文本。
5. tool 消息现有纯文本合并及 `(no tool output)` 规则不变；拆出的图片 user 消息只含图片，不受过滤影响。assistant 投影不在本次规则内。
6. 原消息由输入所有权边界复制后规划，不修改调用者传入的块；过滤发生在最终计量、输入限制检查和 planned 固定之前。

规则是确定的、幂等的；没有 runtime 输出后再次改写，send 只消费原 fixed planned。

## 投影、计量和历史

`openrouter-input-projection/3` 保持不变：它定义最终 body 到有序计量单元、envelope 和摘要编码 C 的关系；该关系没有变化。被修改的是两叶 planner 从消息构造 body 的行为，由新 implementation revision 指认。`openrouter-wire/2`、计量 algorithm/tokenizer/replay revision 均不变。

不修改 `input-meters`、原始来源有限表、历史回放或校准实现。旧 implementation 不被新定义／factory 当作当前绑定；调用者需显式选择新绑定，旧网络与在途工作的责任沿既有精确实现取得规则。校准的来源 binding 是完整原值，后继规则不得隐瞒 implementation 改变或伪造原事实。

实测只证明含图的 A1/A2 形状被两条 Kimi 路由拒收，不能推成「所有含空串的历史都不存在」：纯文本混合、仅空串、历史位置等没有测。本次不依据该未经验证的主张重写历史。沿现行跨修订准入／显式失败政策，不增加旧 factory 别名或兼容入口。

## 选择与代价

- 采用：两叶的精确绑定规则，新 implementation revision。字节变化与拒收证据同范围，其他消费者变化仅是目录修订需要显式更新。
- 不采用：所有路由统一过滤并升投影 `/4`。C 未变，升号会牵动所有叶子发布坐标、历史来源表与计量绑定，超出本次证据和修复范围。
- 不采用：给公开 ModelRoute 新增可选过滤开关。当前只有两条固定叶子需要它，新公开表示与默认值没有独立边界收益；将来新增叶子需要时再明确扩展。
- Anthropic 末条「图片＋空文本」的本地 `unavailable` 属于独立发现，另立 issue；本次不改变其测试或缓存选靶。

## 受影响产物与消费者

| 产物／消费者 | 变化与闭合条件 |
|---|---|
| `src/plan.ts`、Moonshot 官方定义 | 最终数组过滤、精确适用、新实现坐标；相关单测通过 |
| `src/official-catalog.ts`、目录指纹夹具 | 目录修订升 3，追加历史指纹，更新当前 leaves；保留旧指纹原值 |
| `provenance.json`、中英文包说明 | #9797 处置写为 Moonshot 窄采纳；projection 条目准确写现行 `/3`，不声称 `/4` |
| 节点 README、verification 与采用记录 | 分层状态、实际结果和缺口分别登记 |
| 目录装配／最小示例 | 现有 manifest 序号从新 catalog revision 推导，不默默改用户既有数据；无需改示例源码 |

## 验证义务

- MV5-1：两叶的 `[image,text('')]` 和 `[text(''),image]` 最终 content 仅保留 image；计划成功后 projection units 与发出 body 对应。
- MV5-2：同数组多处空串全部删除，非空段次序与值不变；含可見 transcript 的空文本按最终 text 段同规则处理。
- MV5-3：`[text('')]`、多个空串原样，空白原样；无调用者块写入。
- MV5-4：reminder／compaction 的空块在加非空标记后删除，标记仍在原角色。
- MV5-5：至少一个非 Moonshot 叶子对同形状保持旧序列化；名字或 provider 相似的自定义定义不会误命中，错误或旧绑定沿当前拒绝语义。
- MV5-6：现行校准／history／input-limit 回归套件通过，输入绑定保留新实现修订与 `/3`；不由新增测试断言旧记录不存在。
- MV5-7：官方目录两叶 `mp4-19`、definition `3`，目录 3 与新增指纹对拍；其他叶子坐标保持。
- MV5-8：主会话在预算剩余内用当前 planner 的实际请求体向一条 Kimi 路由发送图＋空文本，确认不再被 400 拒收；费用、时间和局限归研究新增运行。
- MV5-9：受影响测试、类型检查和待合并提交的 `make check` 通过，结构与回路读数如实附录。

当前仅为候选：新增绑定 0；所有 MV5 义务待执行，原线上观察不能充当修后验证。
