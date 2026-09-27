# 评审与处置

R1，2026-09-27。候选 N-A＋I-B，尚未接受、尚未发生本候选的独立评审。此前 spec-reviewer 对既有 CB/pi 接缝的只读核对提供了两个输入反例：接收词法不冲突而生成策略范围冲突；LosslessNumber 与 Ajv integer 的局部桥缺失。该核对不是对本候选的批准。

待审：数值视图对当前完整 CB Schema 是否等价、固定拒绝次序与原值保护是否成立、未来消费者边界是否清楚；生产者策略取代范围及确定性编码是否仍符合既有契约。实际意见及处置在发生后追加。

## R1 独立评审 · 2026-09-27

architecture-reviewer（`review_docker_r4`）与 spec-reviewer（`review_rebase_spec`）分别只读核对 R1，未运行测试／网络。四文件 hash 见 [R1 原稿摘要](r1-source.sha256.json)，design 为 `0c92b9d19779181e773ba1ffd46bffbcc7a706559021eea343f6eb7a5fc93256`。以下为主线记录的意见与处置，不是复核结论。

| 发现 | 独立意见 | R2 处置 |
|---|---|---|
| LosslessNumber 的具名谓词类型判别 | spec 判阻断；architecture 判局部实现前提。visibility 为 1e400/9007199254740993 时应 malformed，不能因 wrapper 对象报 visibility_missing | 明确按 JSON 值代数判类型，补 NS-2 反例 |
| 紧凑 JSON 未定义唯一字节 | spec 判阻断；architecture 转交表达审查。a/b 与 a\\/b、非 ASCII 的不同转义会改 hash | 唯一采用 ECMAScript JSON.stringify 无 replacer/space 的字符串数组及 UTF8，含孤立代理项语义 |
| 无界整数的运行时表示／转换 | spec 判阻断；原数字域无上界，不能经 Number 丢位 | 以既有 JsonNumber 作输入，定义不展开指数的精确规范串；非法 target 的规划收口仍明确阻断 pi 入口，本次不新增拒绝值或声称完整 pi 可实施 |
| arrival-events/messages 消费者遗漏 | spec 非阻断；二者更大 Schema 也包含 CB 数值 | 加入开包前未解映射清单；CB 私有视图不自动解决 |
| CallId 判重尚无具体机制 | architecture 指出既有 pi verification 与 session-log 不自动提供登记判重键 | 不再声称“已有规则”已保护；明确模型运行时／写入方实施门，本次不关闭 |
| 从 0 起归属、D-062 精化范围 | spec 非阻断；从 0 起是 pi 选择，AE 只约束非负递增 | 修正归属，列明 CB/messages/pi 哪些映射段落需在采用后更新 |

architecture 未发现本接缝的结构阻断，支持继续推荐 N-A＋I-B，并保留 N-B 无复制优势、N-C 无桥接优势、I-A 简单生成器、I-C 集中责任四项反论据。它认为当前 Schema 范围判断置信度较高、实现兑现仍需实测；没有接受候选。spec 的三个表达阻断不能用 architecture 的结论豁免；R2 等待两者复核。


## R2 定向复核 · 2026-09-27

同两名独立 reviewer 核对 R2 design SHA256 `2dde0ba100823fcfa6dc4f763760e0893d42c2a78395059ae0ad6632ff37feda`。architecture 未发现本范围结构阻断或新增非阻断，支持局部采用不提升模型运行时状态；spec 未发现阻断 CB 独立实施的表达问题，三项中 JSON 类型和字节编码闭合，数字只闭合合法输入成功域。两者均明确保留非法 target、CallId 判重／恢复、其他 Schema 数字桥和 D-019 门，未运行测试。主线随后以 D-068 接受限定技术范围，不把复核写成实现完成。


## PR11 整合候选独立评审 · 2026-09-27

对象是本支 `7b755ac65f63208f0362288f5dad40318b109ec3`、上游 `d4eaf7673bc161bf22f6682385151e080d3323ae` 与 [core11-integration.md](core11-integration.md)（SHA256 `0c487a3caea0ee6ea7e13a6324efa09ec48512eaf5b7be0f2d4c23661af57089`）。architecture-reviewer `review_core11_integration` 与 spec-reviewer `review_core11_spec_scope` 分别独立只读；均未运行测试。

architecture 未发现结构阻断，支持 B：当前全套数值代数及消费者具有复用价值，I-B 不与 CB3 的接收词法冲突，也不需第二套品牌；A 的旧局部QA价值与 C 对真正独立消费者的隔离价值被保留为反论据，但不支持当前额外实现。必须精确承接 Docker R4／I-B、退役 N-A、保持外部24消费者采用2，不能借合并放行完整 pi 或里程碑。

spec 发现一项表达阻断：realization 和公开 README 对 `unknown` 入口无条件承诺从 kind_unknown 到 malformed 的优先次序，但上游复制非 JSON 的 undefined/getter/cycle 时会先 malformed。它核对 CB3 S-24/S-26～29 后判定不足以证明违反冻结契约；原 N-A 的非 JSON 不抢先规则是提供者额外选择。主线在当前映射及中英文 README 补 JSON 表示前置、前置失败结果、域内全树次序和 Proxy 限制；不改冻结 CB3。D-070 明确退役 N-A 的整个范围，承接 I-B 精确段落，并以旧提交＋路径＋历史编号消歧。其余非法 target、CallId 登记／恢复和 D-019 保留。最终 diff 的表达复核另追加，不以初次意见代替。

### 最终表达复核

同一 spec-reviewer 对 D-070 及当前映射、两处提案入口／R5历史编号上下文再次只读核对，未发现阻断或非阻断。B1闭合；原两决定目录7文件、历史投影6文件逐字同7b755ac6，spec/catalog/frozen/consumer-impact无对d4eaf767差异，24外部pins不变。D-070 decision SHA256 `5399a314078ffa4634e0c7d90fcf2f08dfe728e14b66c5565d861ca7e5849539`；CB design `90dcf651a4ee248c3dd1d4946fa33a2b191706643540d2e142ab5a0eec8bc5d2`；公开英文 `1ccb32d0c0a278e4ee40fd86a73fedeedef3930f639132b362c0e6df5ec09401`、中文 `7bcc79660cc202d02a839fab1d60439a6b371a476b26a58aab0a8a6623d90087`。后续快照的哈希机械补全由主线终检，不提升为 reviewer 执行过测试。
