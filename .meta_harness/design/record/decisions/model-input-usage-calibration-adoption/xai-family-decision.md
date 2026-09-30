# D-107 后继：xAI 完整输出组的有限贡献

2026-09-29，主线技术负责人在用户持续实施、调度和验收授权内，采用本页范围。接续[共享家族采用](priority-family-decision.md)，只释放 xAI 两款的必要实现，不表示整家或真实上游认证完成。

## 精确对象与依据

采用 [xAI 提供者 revision 2](../../../realization/packages/model/pi-ai-transport/xai-complete-output-applicability-candidate.md)，SHA256 `45dd429509aae878d794bc01d19617de590d6ae1f9c4ec61b1a3710bcb644fde`；选择与取舍归[选择附页](../../proposals/model-input-usage-calibration/xai-applicability-choice.md)。原候选正文保留当时状态，当前采用由本决定表达。

主线回读提供者全文、固定研究、[独立架构评审](../../proposals/model-input-usage-calibration/xai-applicability-review.md)和第二轮受控失败。独立评审基线为 `646497612780eaac10496e4e7984abe7fa5ba5c9`，其选择附页 SHA 为 `c1210c0154f55a015aa5ac77b43f1ad39d3c219ff22fe48d4f3d1109d21f2a70`；后继 `23546880` 仅追加评审导航及记录。r1 对原/当前 effort 强制相等的限制已在 r2 修正，无范围内剩余阻断。

主线在当前 HUB `cc1e1e2d` 实际构建的公开入口导出两款 V4 工厂，definition `4`、implementation `pi-ai:xai/mp4-18`、algorithm、tokenizer、replay 与基础 transform 均与候选表一致。这只是实施前坐标核对，不是上游身份或回放验证。V5 的实际工厂仍由实施后 X1 验收。

## 释放的实现与必须保留的边界

复用已有完整组核、去重、来源校验和 full/new/φ 唯一贡献函数；xAI 只提供有限格式、来源表与家族纯谓词。原完整组的 upstream O 只计一次，明确为 workload 相关 estimated，reasoning 不再另加，净组 framing 0 保留为估计假设。不能宣称它等于真实输入占用或构成保守上界。

原/当前合法 effort 分别校验。当前 effort 或输出参数改变使输入锚失效时，full 可以在重新核实来源和完整组后独立解释原 O；不把锚不可复用变成原组永久不可解释。未知格式、partial、未知来源或算法仍 unavailable，可判伪造仍先拒绝；不能删历史或回退分词密文。

两款当前执行一起替换为 definition `5` / implementation `pi-ai:xai/mp4-19`。V3/V4 只用于有限解释原保存事实，不保留旧工厂、旧执行入口或兼容分支。实际 `servingProvider/upstreamModel` 映射仍缺真实原件；依赖这份映射的生产出值保持 unavailable，不把本机 TLS 的 xAI 字段当上游认证。实现可以先完成不依赖该未知事实的共用接线和正反验证，不得编造映射。

图片 765/image 的适用证据不足，未采用、未缩减图片供给目标，仍需另行解决。此增量不依赖 ACK、T29、完整 Session/Run，不新增公开契约、服务、状态模型或注册项；新增 bindings 0。

## 验收与后继

X1–X6 是实施完成条件：工厂精确表、完整组一次贡献、来源反控、失效后的 full、真实两入口三轮及旧证据适用性。必须保留已发生的第二轮 opaque 拒绝，修复后原样回放验证；受控输入删除 opaque 的诊断不算成功。同步包 README/README_ZH，旧有效可见路径证据按精确行为复用。

真实 upstream 身份、误差、回放接受、缓存及费用仍待验证。若实际差分显示不可接受的系统偏差、原样回放被拒绝或新证据出现前缀/effort 绑定，沿选择附页重评贡献策略。当前采用不替代这些观察，也不关闭 T21、T22 或 xAI 整家交付。

## 2026-09-30 采用附注：真实身份映射与 mp4-20

主线技术负责人复核 xAI 身份线交付（HUB `70a0eabf`…`e6b6f92e`）后采用：守卫 4 的 `servingProvider`/`upstreamModel` 映射按[真实身份原件](../../../research/model-request-adaptation/vendor-continuation/xai/2026-09-30-identity-and-reasoning-format.md#2026-09-30-真实身份原件)（两叶 raw SSE 逐帧 `provider: "xAI"`、`model` 等于精确路由 ID）实现为逐字节精确一对：`servingProvider === 'xAI'` 且 `upstreamModel` 等于该叶模型 ID，且输出组来源与观测 usage 来源报告同一对；不折叠大小写、不修剪、不按前缀；单字段缺失答 unavailable，两字段全缺仍按守卫 4 准入且不从路由或供应商名补填。

因准入身份改变计划出值（`input_size_unavailable` 变为估算），两叶当前执行由 definition `5` / `pi-ai:xai/mp4-19` 升为 definition `5` / **`pi-ai:xai/mp4-20`**；definition、algorithm、tokenizer、replay 与 transform 不变，沿 [v4 定义设计](../../../realization/packages/model/pi-ai-transport/v4-definition-design.md)「家族行为改变升 implementation、同 revision 不替换函数」与 Moonshot 先例 `19bb829a`。`mp4-19` 保存组仍作合法保存来源行：full 可解释其 O，其 I 不作 marginal 复用。xAI 无 `tokenizers/*/provenance.json`，变更记于 meter 证据串（含两条 generation id）、节点 README 与 [本机覆盖](../../../realization/packages/model/pi-ai-transport/verification.md#2026-09-30-xai-身份映射本机覆盖)。[提供者 revision 2](../../../realization/packages/model/pi-ai-transport/xai-complete-output-applicability-candidate.md) X1 表中的 `5/mp4-19` 保留当时状态，当前坐标以本附注为准。

`calibration.ts` 仅新增一行 `provider === 'xai' && servingProvider === 'xAI'` 的例外并注明原件，其余家族不受影响。本机覆盖：xAI 套件与 reader 绑定 11 文件 189/189，含六种拼写反例（小写 `xai`、`x.ai`、尾随空格、另一叶模型、只有 provider、只有 model）零额外 HTTP；三条变异（去例外行、折叠大小写、去来源一致检查）各被检出。真实三轮（第 2、3 轮 marginal、原样重发密文被上游接受、缓存与费用）仍待 root 以 R7 认证工具执行；此前 R6 场景草稿「第 2 轮 `rejected:input_size_unavailable`」的预期同步改为 marginal。
