#!/usr/bin/env bash
# W4-E 测量自检：secret-forms.mjs 取出的片段能搜到植入的私钥行与十六进制正文、搜不到干净文件；
# scan-structure.mjs 能报出一个没遮蔽的出示物、数得到遮蔽了的三种成员与 PEM 私钥块。
# 在仓库之外的临时目录里做，结束即删；输出写到标准输出。
set -u
C=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
S=$(mktemp -d /tmp/w4e-selftest-XXXXXX)
cd "$S" || exit 1
mkdir -p tree keys
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out keys/k.pem 2>/dev/null
openssl pkey -in keys/k.pem -pubout -out keys/pub.pem
node "$C/secret-forms.mjs" keys > forms.txt
body=$(grep -v -- ----- keys/k.pem | tr -d '\n')
line2=$(sed -n 2p keys/k.pem)
echo "clean file" > tree/clean.txt
echo "x $line2 y" > tree/planted-line.txt
printf '%s' "$body" | xxd -p | tr -d '\n' > tree/planted-hex.txt
echo "expect: planted-hex.txt and planted-line.txt, not clean.txt"
grep -rFl -f forms.txt tree | sed "s#^tree/##" | sort
printf '%s\n' '{"request":{"masked":"{\"presentedLoginState\":\"***\",\"payload\":{\"credential\":\"***\"}}"},"answer":{"masked":"{\"result\":{\"loginState\":\"LEAKEDvalue123\",\"loginStateHandle\":\"abcdefabcdefabcdefabcdef\"}}"}}' > tree/t.jsonl
printf '%s\n' '    {"result":{"loginState":"***"}}' > tree/walk.txt
cp keys/k.pem tree/
echo "expect: loginState 2 occurrences / 1 not masked (LEAKEDvalue123); presentedLoginState 1/1 masked; credential 1/1 masked; PEM private-key blocks 1; loginStateHandle listed"
node "$C/scan-structure.mjs" tree | sed 1d
cd / && rm -rf "$S"
