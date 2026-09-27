# D-088：模型结算共同业务编码窄投影采用

2026-09-27，主线依用户“Implement the plan”、遵循已接受spec／realization实施及主调度／验收职责授权，技术采用[共同业务编码增补](../../../realization/packages/model/model-request-runtime/v4-log-codec-design.md)rev2，SHA256 `f537277f2610b2d98169c69d5c71fcbb3e62fd65de3364ae0ff5148603e92c27`。本事件承接[D-086](../model-runtime-tail-settlement-adoption/decision.md)的RT4与[D-087](../model-runtime-v4-projection-adoption/decision.md)的结算投影，沿既有[共同日志尾条件方向](../../proposals/model-request-adaptation/late-coordination.md)。采用的是同一提供者的技术增补，不新增产品政策、领域操作、契约版本、package、plugin或持久表；旧规范、四件套、v3／v4原投影及bindings字节不变。

采用K1共同业务键、P1窄载荷表示与纯公开捕获／准备／检查构件，具体编码和关联规则以精确增补为唯一实施输入。SL3继续解释壳和不透明键，业务身份与完整消息／响应关联归runtime及各实际写方；公开invokeModel不因此取得日志、Run或生命周期依赖。写前候选无耐久位置，读后才检查真实前缀、相邻和批成员。认回合法先到批按该批自身耐久身份和关联，败方未提交MessageId不同或被占用不能单独否定原批；后续候选稳定和占用要求仍有效。

G29-P采用现有RT4 S-69.3／S-70.2／S-73的组合前提：来源明确的原始空日志或既有合法历史，全部实际写方共同协议与物理对象、persisted消息和响应一次append、旧写方及旁路实际排除，日志提供者兑现整批持久与恢复。纯完整成员检查不能证明物理同批；H1一次提交与H2无插入的分次提交在读面上可相同，不用相邻、wrapper或trusted布尔值自证。来源未知或写方未采用时相关生产认回继续受阻，不清空旧事实、不换号，也不默认为历史合法。任意历史仅凭SL3读面独立认证物理批边界若成为新要求，必须走正式规格演进。

独立architecture-reviewer对rev1未发现架构阻断，将MessageId适用域交表达核对，保留公开批边界对混杂历史的优势、真实来源清点成本及K1体积／精确运算成本。spec-reviewer对rev1发现G29-ER1原批与败方身份适用域、G29-ER2写前与读后位置前提两项阻断，以及G29-ER3首token字段路径错误。rev2仅消歧适用域、修正`R.timing.firstTokenAt`并同步结果表／C-V6；定向复审确认三项闭合且邻域无新增问题。K1／P1／G29-P原字节不变，未重选机制。

主线亲核226项冻结输入、精确最终候选与差分，[273成员评审归档](../../proposals/model-request-adaptation/reviews/model-runtime-log-codec-2026-09-27.tar.gz)SHA256 `e4df3c0e9e67ab5a186d3c98899b99a39534a161e56d74efa4eb2789bdbc0bf9`已全部逐字读回；[索引](../../proposals/model-request-adaptation/reviews/model-runtime-log-codec-2026-09-27.json)逐文件记载校验值。归档中的评审文本是主线据实际独立消息保存的明确归因摘要，不冒充逐字原始报告或人的总体签收。评审未执行产品IO、形式工具或接受动作；作者结构检查的formal为skip，不能充当C-V实证。

本事件只完成G29-C的精确技术采用步骤，允许按此投影实施纯构件。源码实现、C-V1～C-V10、真实全写方迁移／竞争、历史与旧任务停止、宿主恢复和资源测量尚未完成；G29-P／G29-H及G28／G30／G31继续由原owner关闭。与D087五项共同结算构件及十三操作的组合没有被本次采用证明。新增bindings0，官方模型认证0／37，不放行整个P2或人的总体交付。
