# 架构评审记录

对象：本主题的单机直接受信读取 F、注入式 UserRef→个人目标和单租户流候选。此前任务草案见本轮忽略的设计工作区；本页只记录已发生的独立只读复核，不替代规格评审或接受。

2026-09-16 独立 architecture-reviewer 对旧 F→I→T/C 草案指出三项 P1：缺乏强制耐久导入的事实前提、global index 无关 CAS 可使合法注册的固定 T 终局冲突、init 的首个合法根缺定义。结构改稿删除 I/index/混合流；第二轮对单流候选发现 first-init 与被误注入的空部署 signup 前提不一致，以及合法空根判定不足。用户随后纠正实施阶段顺序不能变成 .meta_harness 产品需求；PF-026 恢复“已建立部署内注册”，候选明确受信 init 建立首个账号，当前根须分别核实。独立定向复核在 HUB 35887f6、任务候选 SHA-256 0415d0df…e1ebf 上未发现阻断 B 的结构性反例。

评审固定的任务候选完整 SHA-256 为 0415d0df3cff13fcbcb186e125541ea141ac6c36fcea92f752e5aaf667be1ebf。评审的实际边界：没有运行模型、Schema 或真实认证/Records provider；仅判断能力 owner、单机动作链、候选必要性与首次根的结构。仍须让规范精确写出 credential provider 的原 A 认回、pending 枚举/持续推进、F/target/T/C 编码、同 UserRef 不同 F 冲突、Account 与 Tenant 各自恢复依据。随后由独立 spec-reviewer 核既定设计的规格表达；本页不宣称候选已接受。
