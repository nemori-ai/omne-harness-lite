# Loop extension 验证义务

[公共行为](../SPEC.md)与公开形状各有一个拥有者。本页列能失败的验证，不保存某次运行结果。

| 义务 | 可复跑输入／检查 |
| --- | --- |
| 两表合法组合及精确首拒绝 | tests 的逐格 output／power／position/dimension 判断，malformed 不抢专管拒绝，未知成员及非法配置分别拒绝 |
| 原规范输入保持 | tests/fixtures/normative-examples.json 保独立原输入及期望；narrow-revision-examples.json 的四项保 shape 通过但禁止派发之区别 |
| AR-2 唯一增量 | action-subject-baseline.schema.json 为独立原图；schema-transition.ts 只还原两个 action subjects 后全图相等，保固定原摘要，不从当前实现生成期望 |
| 精确 retained 资源 | retained-schema-expectations.json 固定原 v2/v3 摘要与定义名；实际包内 JSON、$id、公开 resource 闭包一致，没有旧 executable alias |
| 真实 input 与改写 | 原 subject、署名、immutable、binding 逐值比较；纯 positioned 判断不捏 Run／log/env，合法不推出真实资格 |
| 完整失败历史 | 同 call/session 的原 snapshot/binding/dispatch；完整前缀保重复、同 timestamp、已生效未重发及全部 retry；缺来源不补 [] |
| 固定图交付 | build 失败清 dist/generated，缺资源／helper 不回退；src/dist 有同一完整图，第一次校验原生加载 |
| 边界 | 表示非法先拒、不修补。句柄只本调用、无 host fallback；history／授权／等待／持久副作用由效果拥有者验证 |

从包目录运行 pnpm test、pnpm typecheck 和 pnpm build。输出留本工作树 tmp。纯数据没有独立状态模型，测试不证明真实 Session／Agent 或任意外部贡献者终止。
