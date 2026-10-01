Both points verified against the sources. Nothing blocks.

**Point 1 (PF-010 §四) — closed.** Acceptance line 127 lists "摘要里写什么、写多长、由谁生成" under 不验收, reason "同上" = 全在闭包内部. Draft lines 9 and 25 cite it directly, frame the question as whether instruction attribution deserves a narrow exception to that policy freedom, and line 35 marks direction 2 as closest to current state. Analysis §8 table and §8.1 match.

**Point 2 (after_compaction) — closed.** The draft's three claims each hold:
- S-21 row `after_compaction`: observed/inject/stop/ask ✓, veto/rewrite ✗. So "no veto on the done compaction, but not merely observe-and-record" is exactly right, and R2's "至多观察记录" was indeed too narrow.
- PF-012 否决三路 (design.md:1324-1328) list external / model reply / tool result only; no system-summary route. The draft says precisely "穷举三路，未单列系统摘要" without asserting whether CompactionMessage passes the before-persist position at all, which is the honest reading since design.md:1020 says "不论它是谁产生的" while :1039 enumerates three kinds.
- design.md:1277 confirms "之后" positions have nothing to intercept.

**Conclusion stands:** worth supplementing the report, plus one unpublished, unaccepted narrow design discussion draft. Not a vulnerability claim, not a rule change.

**Remaining, non-blocking:**
- Owner wording differs slightly: draft line 3 says owner PF-010 with PF-009/PF-012 协同; analysis line 181 says owner PF-010/PF-009, PF-012 参与. Pick one phrasing when archiving.
- Optional one-clause nuance for line 26: `stop` at after_compaction halts this Run, but the persisted CompactionMessage remains in the log; blocking later consumption still relies on before_model_call/before_action veto or a new path. The draft does not claim otherwise, so this is a clarification, not a correction.

Not verified here: file hashes in r3/inputs, remote blob equality, any runtime behavior.