# 评审与处置

- 待审对象：新结构链 round-1 exact commit（提交后固定）
- 当前事实：`9a58ae2` round-3 已被 architecture/spec reviewer 拒绝并冻结；本包是新候选
- 当前评审：尚未进行新候选独立评审

| 发现 | 影响 | 作者处置 | 复核 |
|---|---|---|---|
| Session force-stop 与 Tools supersede 可无条件重复写 epoch close | RN-01/LC/provider | 收回消费者写权，采用 Run owner preparation | 待复核 |
| prepare 与 append 若绑定为单 owner transaction，无法与 Session hold 原子组合 | CC/LC | prepare 改为无副作用；submit 时 owner guard 重核 | 待复核 |
| Run revision 可能被误写为 fact sequence | CC/DR/Run | 采用协调结论 C：一次 owner append/operation +1；同 append facts 共享 revision，最终 envelope/append-local order 排序 | 待新候选复核 |

## 仍未闭合的事项

新候选 architecture/spec review、formal TLC、provider integration 与用户/有权决定仍未完成；不得消费为 accepted/released。
