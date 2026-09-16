# 提案

本家族拥有需要持续消费的候选边界、能力覆盖与取舍。每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 新主题从本地 [topic 模板包](.templates/topic/README.md) 开始，复制为 `<topic>/`；包内为入口和 `design.md + alternatives.md + review.md`。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 从现有能力的覆盖与剩余责任推理；推荐、评审和接受分别记录。

## 主题准入与候选比较

每个正式 proposal topic 至少提供 **3 个有实质差异的 candidates**，围绕同一个可判断的选择对象比较。
每项说明责任/机制、怎样兑现必要要求、成本与风险、来源/证据及未决前提；不能将改名、参数微调或空占位符凑成候选。
候选不必最终都可采用；被约束或反例排除的真实路径仍保留排除依据，不能捏造明显无关的陪衬。

尚不能形成三个真实候选时，先保留研究或任务级探索并补齐选择空间，不以不完整 topic 冒充已达到提案准入。
已有有效决定下的普通局部工作直接沿用其依据，不为满足数量另造提案；准入不赋予接受权限。
比较方法见[设计选择](../../agents/skills/harness-design-handbook/canonical/references/design-decisions.md)。

**停止条件：**选择对象、现有能力覆盖或剩余责任尚不清楚时回到需求/研究；不足三个真实候选时留在研究或
任务探索；需要改变已接受语义时等待有权决定。作者推荐、评审通过和模板齐全都不产生接受。

命名、裁剪与跨家族引用遵循 [信息包约定](../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

本节按实际子目录链接 topic README，并标明选择对象、候选/接受边界与当前消费范围；未被索引的任务草稿不因此成为正式提案。

- [产品账号身份与注册旅程](account-identity/README.md)：比较独立账号能力与成熟嵌入式 provider、独立 IdP、Tenant 扩展；候选 A 的能力边界与 provider 验证方向已由 D-016 接受，具体 provider 未定。
- [个人租户创建协议统一候选](personal-tenant-creation/README.md)：比较双窄许可、统一 global index 与按账号分区 claim；推荐统一路径但尚未接受，Account 当前推进许可的门内语义仍未闭合。
- [账号到个人租户的单机创建边界](account-personal-local-creation/README.md)：在 D-016/D-017 已接受边界内，比较同一原子事务、本地直接受信读取来源事实和耐久导入三条路径；推荐直接读取与单租户流，精确规格和证据仍待闭合。

判断方法按需读 [手册对应页](../../agents/skills/harness-design-handbook/canonical/references/decompose.md)。
返回 [系统设计链](../README.md)。
