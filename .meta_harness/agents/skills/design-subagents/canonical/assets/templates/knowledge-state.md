# 任务认知状态

仅记录可交接的信息；短任务可使用同等含义的返回消息。

- 任务/角色身份：{{identity}}
- 当前仓库、工作树、版本及最后核对时点：{{revision}}
- 目标与允许/禁止动作的来源：{{authority}}
- 当前状态、受阻动作和原因：{{status}}
- 已完成成果及证据位置：{{artifacts}}

| 分类 | 内容 | 来源/版本/观察条件 | 影响或依赖 | 下一步/解决者 |
|---|---|---|---|---|
| Known fact | {{fact}} | {{evidence}} | {{scope}} | {{verification_if_needed}} |
| Accepted decision | {{decision}} | {{acceptance}} | {{scope}} | {{none_or_owner}} |
| Hypothesis | {{hypothesis}} | {{basis}} | {{dependent_claims}} | {{falsification}} |
| Unknown | {{question}} | {{missing_evidence}} | {{blocked_actions}} | {{resolver}} |
| Rejected / superseded | {{old_claim}} | {{counterevidence}} | {{invalidated_work}} | {{replacement}} |

- 未获回复的澄清及联系人：{{pending_questions}}
- 下一项已授权动作：{{next_action}}
- 恢复时需重新核对的前提：{{recheck}}

不得将 hypothetical / unknown 在摘要中改写成 confirmed，也不保存凭证或私有思维链。
