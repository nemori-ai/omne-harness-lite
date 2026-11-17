#!/usr/bin/env bash
# 令牌池的入口：整台机器的核按令牌记账，一件活拿到令牌才执行，按先来后到排队。
# 实现与全部策略说明在 with-test-slot.mjs（只用 Node 标准库，macOS、Linux、Windows 通用）；
# 这里只转发，调用方（package.json 与 scripts 下的入口脚本）不用改。
exec node "$(dirname -- "${BASH_SOURCE[0]}")/with-test-slot.mjs" "$@"
