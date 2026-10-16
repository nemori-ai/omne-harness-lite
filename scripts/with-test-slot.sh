#!/usr/bin/env bash
# 运行名额的入口：同一台机器上同一时刻只让有限个重负载的检查在跑，其余按先来后到排队。
# 实现与全部策略说明在 with-test-slot.mjs（只用 Node 标准库，macOS、Linux、Windows 通用）；
# 这里只转发，调用方（package.json、Makefile、check.sh）不用改。
exec node "$(dirname -- "${BASH_SOURCE[0]}")/with-test-slot.mjs" "$@"
