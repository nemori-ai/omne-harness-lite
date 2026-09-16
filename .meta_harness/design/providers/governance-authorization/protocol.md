# Authorization 当前协议

本页提取来源设计中仍约束 AU 的当前协议；它是 candidate 施工输入。目标包、host、plugin、
事实源 link 与真实判定门尚未实现。

## 无环事实源

事实源必须具名且无环：SR 提供 SessionFacts，不在该模式递归调用 AU；TL 提供冻结 Action/
binding，不调用 AU；资源 owner 提供 ResourceFacts；HD 提供 decision/consumption facts。
AU 只检查可申请资格，HD 检查决定，二者在具名 join 中组合，不能互相冒充状态 owner。

## 双边登记与撤除

每条 link 在 gate 外 prepare，在同一个 coordinator `enter` 内向双方登记相同的 host、source、
registration、generation、scope 与 stamp，提交后才通知。SR↔AU 等 link 必须双边可见；
LOADING 只允许 held，不能出现半开可调用边。retire、inspect 与 waitReleased 都绑定精确登记，
撤除先封闭新判定，再排空旧代候选。

## HD 重载消歧

HD 重载会使旧 DecisionFacts 私有候选和 runtime handle 失效，但不会自动取消 HD 拥有的、
已耐久且未消费/未关闭的一次批准。当前 HD 只能在对原冻结 Action 完成当前重检后重新签发
候选；approval 不是 grant，已消费、已关闭或身份不匹配的决定不得复活。若结果为 ask 而
没有真实 HD route，必须明确标为不可执行，不能伪造已批准。
