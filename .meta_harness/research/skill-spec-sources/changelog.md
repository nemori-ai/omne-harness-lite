# Skill 规格参考来源 结论演进记录

当前该信什么始终在 [research.md](research.md)，本文件只解释它为什么长成现在这样。
事件词的判定标准归[家族入口](../README.md#演进事件词)，此处不复制第二份定义。

rev 1–2 同属 2026-09-23 的第二轮核对：提案「Skill 规格采用」把「钉存开放格式原文」列为接受前必须补的一项，
产品负责人同日要求参考 omne-next 与 Codex 与需求兼容的扩展。两条都是此前未覆盖的新增，首轮结论的正文一字未改；
共用一份[依据报告](reports/2026-09-23-round2-open-format-and-extensions.md)。

## rev 2 — 2026-09-23 · 补充

**盘点了 omne-next、Codex 与 Claude Code 在 `SKILL.md` 之上的扩展，逐条归到提案的键分四类并写与 P1–P8 的关系。**

- 受影响结论：新增「[omne-next 的扩展都在 SKILL.md 之外，或以不同键名出现](research.md#omne-next-的扩展都在-skillmd-之外或以不同键名出现)」
  「[Codex 的 skill 扩展全在侧车文件 agents/openai.yaml](research.md#codex-的-skill-扩展全在侧车文件-agentsopenaiyamlfrontmatter-只读三处)」
  「[Codex 的 dependencies 只认 mcp](research.md#codex-的-dependencies-只认-mcp用途是点名时提示安装不参与可用性判定)」
  「[Codex 的调用面开关一处在侧车内容里，一处在配置层](research.md#codex-的调用面开关一处在侧车内容里一处在配置层)」
  「[Codex 以 SKILL.md 路径为身份，同名并列](research.md#codex-以-skillmd-路径为身份同名并列)」
  「[OpenAI 插件从 MCP 导入 skill 时逐资源带 sha256 摘要](research.md#openai-插件从-mcp-导入-skill-时逐资源带-sha256-摘要并取静态快照文档级)」
  「[Claude Code 另加十四个键](research.md#claude-code-在开放格式之上另加十四个键并放宽-metadata-与-allowed-tools-的类型)」
  「[本机实例对开放格式规则的机械套用结果](research.md#本机实例对开放格式规则的机械套用结果)」
- 触发：需求方要求（产品负责人 2026-09-23：叠加参考 omne-next 与 Codex 与需求兼容的拓展）
- 原结论：无，此前未覆盖。首轮对 Codex 只引过斜杠命令 topic 的 CX-7；omne-next `omne_agent_capabilities` 只做了文件级观察（E8）
- 新结论：见上列各条；盘点表 42 行在报告第三节
- 证据差异：新增 [E19](evidence.md#e19-omne-next-的扩展复读与补读)–[E25](evidence.md#e25-claude-code-文档的-frontmatter-全表照引同程钉存字节)；Codex 所读源码钉存为 `sources/codex-5c5308f-skills.tar.gz`
- 对象版本：omne-next 未变（`6263fed5`）；新增 Codex `5c5308f`、本机 Codex CLI `0.156.1` 实例；Claude Code 文档照引同程钉存字节（v2.1.280）
- 下游要复核：[proposal「Skill 规格采用」](../../design/record/proposals/skill-spec-adoption/design.md)的「剩余责任」表与 alternatives 的键分类表（外部属性类清单未含 Claude Code 文档里的 `arguments`、`disallowed-tools`、`effort`、`context`、`agent`、`background`、`hooks`、`paths`、`shell` 与 Codex 侧车键）
- 依据报告：[reports/2026-09-23-round2-open-format-and-extensions.md](reports/2026-09-23-round2-open-format-and-extensions.md)

## rev 1 — 2026-09-23 · 补充

**钉存了 Agent Skills 开放格式原文（`69ef37e`），核对字段与必填、name 规则、`metadata` 值类型、未知顶层键、`allowed-tools` 与定界。**

- 受影响结论：新增「[开放格式只定义六个 frontmatter 字段](research.md#开放格式只定义六个-frontmatter-字段必填只有-name-与-description)」
  「[name 规则五条](research.md#开放格式的-name-规则五条字符集表述自相含糊参考库接受-unicode-字母)」
  「[metadata 值只许字符串](research.md#开放格式规定-metadata-值只许字符串实现与生态实例多处不守)」
  「[对未知顶层键未作规定](research.md#开放格式对未知顶层键未作规定参考校验器拒收两家宿主静默忽略)」
  「[allowed-tools 是实验性字段](research.md#开放格式的-allowed-tools-是实验性字段没有要求宿主必须执行)」
  「[没有规定闭合定界行必须独占一行](research.md#开放格式没有规定闭合定界行必须独占一行参考库与-omne-next-core_v1-都会截断)」
- 触发：新证据（首轮按派发约束不引网络原文，其「未知与下一项证据」表列有「网络上的 Agent Skills 规格原文与本机实例是否一致」一行）
- 原结论：无，此前未覆盖。首轮「SKILL.md 开放格式与身份是 name 兼容，但与产品正文在四处不对齐」明写依据是本机实例与 DSH 源码、不是规格原文——那条的真值不受本轮影响
- 新结论：见上列各条
- 证据差异：新增 [E15](evidence.md#e15-开放格式规格原文六个字段name-规则metadataallowed-tools)–[E18](evidence.md#e18-规格仓库的-issue-与-pr-状态)；原文与参考库字节、探针脚本与输出、issue #474 原样 JSON 钉存于 [sources/](sources/provenance.json)
- 对象版本：新增 agentskills/agentskills `69ef37e`（规格无版本号）
- 下游要复核：[proposal「Skill 规格采用」](../../design/record/proposals/skill-spec-adoption/design.md)的「证据义务与受阻消费」第一行与 alternatives「会改变选择的证据」表——逐条对照见[报告第五节](reports/2026-09-23-round2-open-format-and-extensions.md#五这一轮对提案会改变选择的证据表的逐条对照只报事实)
- 依据报告：[reports/2026-09-23-round2-open-format-and-extensions.md](reports/2026-09-23-round2-open-format-and-extensions.md)
