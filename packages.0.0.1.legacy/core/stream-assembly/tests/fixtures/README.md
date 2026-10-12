# 规范验证输入

assembly-examples.md 与 arrival-events 的 arrival-examples.md 是实际规范输入，source-examples.json 保存逐项原片段、规范 JSON、行位置及所在文件摘要。路径和说明链接迁移，所有实例、原片段、规范化规则与拒绝预期保持。

Schema 变化守卫使用 content-blocks 的 content-before-admission.schema.json 独立回归输入。固定依赖图及模型摘要由测试明确声明，不从被测产物生成预期。这里不保存中央契约、采用登记或运行日志。
