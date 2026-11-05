# 使用与系统位置

## 使用方式

用 json-text 的 readJsonText 取得配置 JsonValue，然后调用 createFilesAuthor。Files 配置含必需的 resultMaxBytes 与可选的 cwd。cwd 是绝对路径的工作区根，相对路径按它解析，规则见 [SPEC](../SPEC.md#文件路径解析)。Shell 还要求 executable、argsPrefix、cwd、env。不存在未测试的默认字节上界，也不继承 process.env。

Shell 配置示例为 {"resultMaxBytes":32768,"executable":"/bin/sh","argsPrefix":["-c"],"cwd":"/work","env":{}}。该示例是调用者输入，不是平台探测或推荐的生产默认。

Tool loader 读取 filesToolModule 或 shellToolModule。工具资产提供名称、采用与治理事实，作者只提供实现。独立执行的完整可运行方式见 [run-author.ts](../tests/run-author.ts)。binding 读者仅用于受信 Tool 绑定与测试装配。

## 消费者与定位

Files 声明 files 设施，Shell 声明 command 和 terminal。两者兼容公开 bindingKinds 的各层，不在作者里决定策略或隔离要求。宿主把这份能力声明与当前授权策略求交，再提供对应门面。缺设施时明确报告不可用。

Files 门面用当前对象点名器填 named，包含 move/copy 的目标父对象与 batch 的每个目标。Shell 的 facts 来自合法执行落点，包含 os、release、architecture、facilities。不得用作者进程的平台代替落点。

## 调用参数与结果

参数使用 snake_case。Files 与 Shell 用 `wrapped` 编码调用，例如 `{"command": "write", "params": {…}}`。查询某个命令的完整声明时调用 `{"command": "help", "params": {"name": "write"}}`。Files 的 edit 使用 path、old_text、new_text。patch 使用 edits 列表，每项包含同样三个字段。Shell execute 使用 script，可选完整 terminal 引用、cwd、env、stdin 与 run_in_background。

结果是 Unix CLI 风格文本。复制分页偏移、版本及终端完整引用。unknown 不得重发为新批次。图片附件与后台工作尚未实现。
