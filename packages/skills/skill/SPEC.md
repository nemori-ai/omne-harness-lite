# Skill 正文端口

本成员实现已接受的 `skill` 类别端口。它不拥有发现、脚本执行或发布。

调用方先用 `@omne-harness/assets` 的 `readBodyText` 读取正文。`judge` 不接受对象字面量，也不调用正文上的函数。能力名与正文 `name` 不一致时返回 `name-mismatch`。`tools` 里出现非 `tool` 身份或空名字时返回 `incomplete-reference`。`references` 只在判断可以通过时返回 Tool 身份。
