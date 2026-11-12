# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格。数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

- `call-bound-in-run.json`：一条 Run 内调用登记（SE18）的载荷，由 `call-registration.spec.ts` 读。对应 SPEC「稳定调用引用的读取」那张两种存法的表。它是服务端应用的正式装配在一次真实的一轮里写下的：在 `apps/harness-server` 的慢层里用本地模型网关跑一轮，从读者的日志读取面读出这一条，`writeJsonText` 写成文本后缩进成 JSON。Run 外的那种存法在服务端应用里还没有写入方，用例用本包的 `encodeEntry` 造。
