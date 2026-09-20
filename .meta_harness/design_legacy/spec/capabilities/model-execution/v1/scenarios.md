# Model Execution v1 联合恢复场景

本页固定 M durable disposition 与 active public-state 的候选边界；未进入现有 ModelSelection 模型。

| 编号 | 场景 | 条款 | 断言 |
|---|---|---|---|
| MES-01 | A/e1 已明确业务 unknown，以 settled_without_message 的 current revision r1 耐久提交并首次 semantic close；inspect 后找回 success+正文，以 expected r1/evidenceId CAS r2，并与 Step唯一success、Run fence/RN-05同门核对 | MC-04、MC-06 | 门通过才 settled_with_message；history不改写，semantic close仍一次；并发CAS只一支成功。仅 receipt 未知则由先前耐久 `attempt.closing.pending` fold 为 closing/outcome_unresolved、无 current revision、不 close；active snapshot 不参与该 fold |
| MES-02 | A/e1 被durable fence，恢复owner取得A/e2；旧provider仍尝试publish，另一个独立B开始 | MC-04、MC-06、MC-12 | A/e1发布拒绝；A/e2 terminal支配A旧草稿；B必须不同attemptId，可与A排空并存 |
| MES-03 | listener effective cut10后pub11入buffer；snapshot cut10给compact state coveredThrough=k；drain时pub12到达 | MC-12～MC-14 | callback按pub.n有序可靠入队；state=fold `[0,k)`；enqueue与empty→live线性化，11不能晚于12 |
| MES-04 | A在listener前terminal并离开active；active snapshot为空，ended丢失 | MC-06、MC-13 | durable disposition是唯一恢复依据；active缺席不推outcome |
| MES-05 | A的disposition已按Session retention过期，客户端仍有旧草稿 | MC-06 | M不建立第二历史；Session snapshot只返回授权保留集合，客户端把缺席标为local evidence_unavailable，不重建或推断failed/unknown/abandoned |
| MES-06 | A late success 到达时 Run 已有 RN-05 终止意图或 Step 已接受 B success | MC-06、RD-08、RN-05 | A 只追加 audit/cost/isolation observation；不生成 Message/tool batch；abandoned 封闭全部业务出边 |
| MES-07 | 两订阅 L1/L2；L1 callback overflow，L2 正常；随后 transform 版本变更 | MC-12、MC-13 | 只撤 L1 并 resubscribe，source/L2 不 unavailable；transform 变化必须新 sourceGeneration，旧 generation frame 不跨代应用 |
