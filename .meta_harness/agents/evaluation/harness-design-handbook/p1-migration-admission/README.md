# P1 真实迁移准入试用

本试用检查 handbook、family 准入和模板能否让一个未参与编写的 agent 对真实旧材料作出一致处置。
它不评价产品语义，也不授权迁移或删除来源。

- [派发输入](prompt.md)：读取实际旧 `capability-basis-framework/plan.md`，只做准入与拆分判断。
- `result.md`：由独立只读 agent 返回后记录实际输出、读取页面与停止点。

通过条件：识别整份一次性交付计划不能进入 design；只允许把仍有持续消费者的方法结论整理到唯一方法拥有者；
不创建 product proposal/migration topic，不把来源的接受/实现状态升级，并指出模板只在准入后使用。
