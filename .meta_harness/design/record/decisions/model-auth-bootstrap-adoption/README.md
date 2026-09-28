# D-092：真实鉴权验收启动投影采用

[决定](decision.md)精确采用应用的 [v3-auth-bootstrap rev1](../../../realization/retired/model-request-acceptance/v3-auth-bootstrap-design.md)，只替代真实身份/目录/model-only CCL 阶段的确认与装载顺序。基础六 fiber 就绪后确认，目录/lookup 等完整八 fiber 就绪后才开放业务；确认后部分启动失败保留已提交事实。

AB-V1～V8、真实应用源码及符号权限守卫尚待。原完整纵线、storage 缺口、十三操作和模型认证不升级。
