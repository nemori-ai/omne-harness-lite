# pi `3390bd9`：TUI 的 `/` 命令（对照，不展开）

- 原始出处：earendil-works/pi @ `3390bd93630965a12a0a1a5c36ce890ec22f7e1d`。
- 取得方式：主检出 `tmp/sources/pi-3390bd9.tar.gz`（sha256 见同目录 `SHA256SUMS`）解包于 `tmp/sources/extracted/pi/`；只读 `packages/coding-agent/src` 里与 `/` 相关的四个文件。路径以 `packages/coding-agent/src` 为起点。
- 来源立场：上游作者源码；未查 issue。
- 消费对象：research.md 对照表 pi 列（只填识别、未知处理与两种性质三行）。

## 当前可消费观察

### PI-1

**先 trim，再按固定顺序认领：TUI 内建 → 扩展命令 → `/skill:<name>` → 提示词模板；都不认的原样当 prompt**

- `modes/interactive/interactive-mode.ts:3043-3045`：提交处理先 `text = text.trim()`；`:3048` 起逐条字符串比较内建命令（`/settings`、`/model`（`:3058`）、`/compact`（`:3152`）、`/new`（`:3147`）、`/quit`（`:3183`）…）。
- `core/agent-session.ts:1296-1311`：`prompt()` 对以 `/` 开头的文本**先**试扩展命令（「execute immediately, even during streaming」），命中即不发 prompt。
- `core/agent-session.ts:1481-1489`：`/skill:<name>` 展开为 `<skill name=… location=…>…</skill>` 块 + 参数；找不到 skill「pass through」。
- `core/prompt-templates.ts:269-286`：`expandPromptTemplate` 匹配 `^\/([^\s]+)(?:\s+([\s\S]*))?$`，命中模板名就做参数替换，否则返回原文。
- `core/agent-session.ts:1513-1525`：排队（steer / followUp）路径对扩展命令直接抛错，然后同样展开 skill 与模板。
- 推断：未知 `/foo` 与 `/usr/bin` 都原样作为 prompt 发出（`expandPromptTemplate` 与 `_expandSkillCommand` 都在不命中时返回原文）。
- 支持范围：代码阅读，无单测核对。

### PI-2

**内建清单与参数占位符**

- `core/slash-commands.ts:4`：命令来源三种 `"extension" | "prompt" | "skill"`；`:19-44`：`BUILTIN_SLASH_COMMANDS` 24 条（settings model tree thinking scoped-models export import share bug copy name session changelog hotkeys fork clone trust login logout new compact resume reload quit），部分带 `argumentHint`。
- `core/prompt-templates.ts:57-70`：模板支持 `$1…`、`$@` / `$ARGUMENTS`、`${@:-default}`、`${@:N}`、`${@:N:L}`；参数里的占位符不递归替换。
- 推断：`/skill:` 与模板展开都**改写了消息文本本身**，进入会话的是展开后的全文（未读会话持久化代码核对）。
- 支持范围：代码。

## 局限

- 只作对照：未读 pi 的会话持久化、扩展命令注册与菜单补全；未查 issue。
