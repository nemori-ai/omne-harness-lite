# 固定输入与故障材料

## 允许的内容

本目录保存具名事务失败参与者。测试需要的业务数据由 [seed.ts](../seed.ts) 用公开命令在新库上建立，本目录不保存数据库文件。

## 边界

数据是合成测试业务，不包含用户数据或密钥。

## 维护

reject.mjs在事务中返回失败；late-reject.mjs经材料requiresFacts依赖WaitOwner完成，用于验证F已写后的共同回滚。guard.mjs 代表原工作拥有者的事务内守卫：facts.verdict 为 live 时参与，否则以 conflict 停止整笔提交。它们不代替业务参与者，guard.mjs 也不代替 Session 的真实守卫。
