# Durable Records v1 验证范围

| 条款 | 当前证据 | 限制 |
|---|---|---|
| DR-01 | 契约、Schema 与 provider 映射 | 批内顺序/多流原子性待真实提供者验收 |
| DR-02～DR-04 | Recovery 模型登记；JSONL 设计映射 | TLC 未运行；文件系统耐久性未证明 |
| DR-05 | 契约与 provider 退出设计 | 排空、前缀核对与换代组合尚无产品证据 |

本候选的 [v1 验证义务](v1/verification.md)中，DR-S01～S08 的真实端口/JSONL/
Admission/owner 联合测试均未在统一协议下执行。Recovery 模型本轮未运行，且不覆盖
revision/eventId、F 直读、T/C 单流映射或 owner publication。旧 personal 混合流测试与 provider
映射仅作历史线索，不构成当前候选证据。v3 严格 replay 和实际开发 journal 存量
清点待完成；没有旧格式兼容承诺。
