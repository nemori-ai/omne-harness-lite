# D-089：模型时间关联所需精确比较投影

[决定](decision.md)技术采用原 offer-expiry 节点的[精确原串排序增补](../../../realization/packages/core/offer-expiry/rfc3339-order-design.md) rev1，SHA256 `249c68ea3239977131cc44be3d75dbd31474e0659355258c2606833eb2bfaab2`。选择B／R1：在合法RFC3339时间点前提下精确排序，不改旧毫秒Instant、Clock或规范时间域，不认证外部闰秒公告。

[接受记录](acceptance.json)钉住77项输入及107成员[评审归档](../../proposals/model-request-adaptation/reviews/model-runtime-rfc3339-order-2026-09-27.tar.gz)。只关闭TL-G2的技术采用步骤；TL-G1真实时间生产者／宿主／合法历史证据、源码与TO-V1～9、runtime完整组合和37认证仍待。新增bindings0，未实现、未验，不替人的总体接受。
