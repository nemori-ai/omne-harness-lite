# Model input usage calibration：第二轮候选实际运行

候选 `62ab2001`（HUB `1fef9c90`）针对[第一轮独立评审](../../proposals/model-input-usage-calibration/review.md)的 B1～B3/N1～N2 修订。尚未接受，不是实现验证。第一轮证据保留在前一个 run，未原地覆盖。

作者实际结果：20 个 Schema/关系实例符合预期；TLC 6 个正向配置通过、16 个负控命中指定性质。三轮一般配置 1,675,125 distinct；稳定后继重锚配置 66,825 distinct，检查 ReanchorProgress 和 EventuallyReanchored，另保留 EventuallyDone。NeverUseAnchor 与 KeepOldAnchor 均以 exit13 报出具名 ReanchorProgress 时序反例；14 个原安全负控 exit12 报指定 invariant。详见 [原始命令、数据和边界](author-run/EVIDENCE-README.md)。

主线独立核对 86 个完整输入快照、压缩包逐成员字节和 22 份配置 SHA/原始日志结果。root-check.json 是这一有限核对的结果，不冒充独立 TLC 重跑。inputs.tar.gz、inputs.json 保存精确完整候选输入；正向任务目录使用 registry task id。

重锚检查前提是 StableSuccessor、准确观察、可读已确认原批、有限三轮和明确弱公平调度，窗口100只让此有限域能够发生后继规划，不推出真实窗口永不超限。负控刻意仍允许流程终止，独立验证“不复用”和“只复用旧锚”不能满足新性质。非稳定/缺usage的安全配置另保留原范围；不扩十三操作状态机。

初始结果收集器未匹配 TLC 的具名单数 temporal-error 文本，将两项预期反例汇总为 false；原始日志未改，修正的是判读，旧结果 JSON 保留。不得把任意非零退出算成指定负控。作者全部原始运行文件位于 author-run；重跑应新建 run。

未覆盖实际上游/tokenizer/φ/δ正确性、模型认证、权限/存储掉电/网络取消、真实性能和运行时实现；当前没有付费请求，也没有产品接受。冻结规范的验证文件仅载义务，运行状态归本记录。
