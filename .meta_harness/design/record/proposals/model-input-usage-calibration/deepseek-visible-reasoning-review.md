# DeepSeek 可见推理计量的有限架构评审

2026-09-30，主线记录独立 `architecture-reviewer`（`deepseek_visible_reasoning_review`）的两次只读交接；本记录不是 reviewer 自写文件，也不是实现验收。

受审基线 `3f2e065a3f9e38058c45feb3b1f40595d62f3739`。对象为 [provider 补充](../../../realization/packages/model/pi-ai-transport/deepseek-visible-reasoning-estimate-design.md)：revision 1 SHA256 `9d6037f504ae9b739a6591bcd2cd6ae37c2ea3a26034aab1ce5823bdedfe8944`；定点复审 revision 2 SHA256 `d3c298d56759f8e6504a1da095804a730487f563738528b6a59c6dd6107e63ed`。两次均未运行测试、改文件或请求模型。

## 判断与处置

范围内无阻断：RT10/RT12 S-74③、S-78、S-79⑧已允许有据 estimated，不以未知秘密模板为普遍前置；MR9/MR11 S-43 禁止无条件 I+O，不要求可见文字必须从 O 推算。本候选不新增 O 映射、服务、对象、存储或跨 owner 保证，保留原 wire/组事实和一次 margin；仅为此有限形态无须规范后继。

N1：revision 1 将 `defineInputMeter` 当成已有来源守门不符合代码事实。它只冻结函数；共同校验实际在 `measureFull`、`measureReplay`、`measureNew` 包装内。直接调用 factory 方法可能忽略非法显式 history。revision 2 将两款 factory 接入共同包装、私有原始对象避免递归、DV3 直接入口正反测试列为明确实施责任。独立定点复审判 N1 在设计层闭合，无新增发现；不表示代码已兑现。

## 反论证与范围

继续拒绝全部 details 可避免误认私有格式，但会阻断选定模型真实多轮，且未知模板不取消已授权估算。直接用原 O 虽有真实来源，但尚无输出量等于回放输入的适用依据。修改实际 wire 为 reasoning_content 可统一参考表示，却会改变未经核实的上游协议。本候选因此只改计量副本，复用固定 encoder。

DV1–DV5 均未执行；当前路线形态、误差、稳定 P 零 tokenizer 访问、真实 wire 和实停待实现及 root 验证。旧捕获不是新绑定认证；type/format/index 的私有计数影响未知，不能宣称零成本。若真实数据不可解释、P 实质变化仍走 marginal，或非法来源被 full 掩盖，应复核相应保护点。没有新增产品待裁决。
