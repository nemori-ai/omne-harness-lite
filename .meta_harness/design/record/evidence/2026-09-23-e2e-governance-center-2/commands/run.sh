#!/usr/bin/env bash
# W4-E 独立复跑：从零装依赖 → 构建 → tenancy-host test:e2e（证据写进本目录）→ 照 tests/e2e/README.md 手动起中心、walk.ts 走一遍
# → 用本次跑出的秘密值（套件自报的一份 + 本脚本自己从私钥文件取的一份）对本目录与上一次 run 目录各 grep
# → 与秘密值无关的结构核对。每一步一份日志，带命令、起止时刻与退出码；退出码汇总在 output/runner/exit-codes.tsv。
# 全部临时材料（套件的临时根、秘密清单、手动中心的数据与密钥）放在仓库之外的 $WORK，跑完即删。
set -u
ROOT=/data/qiwei/repos/omne-harness-lite/.worktrees/tenancy-leg-2-e2e-verdict
RUN=$ROOT/.meta_harness/design/record/evidence/2026-09-23-e2e-governance-center-2
PREV=$ROOT/.meta_harness/design/record/evidence/2026-09-23-e2e-governance-center
OUT=$RUN/output/runner
MAN=$RUN/output/manual
WORK=$(mktemp -d /tmp/w4e-XXXXXX)          # 短路径：运维面套接字的完整路径受 108 字节上限约束
SUITE_TMP=$WORK/t                          # 套件的 os.tmpdir()，好让它留下的临时根只属于本次
SECRETS=$WORK/suite-secrets.txt            # 套件自报的秘密（OMNE_E2E_SECRETS_OUT）
INDEP=$WORK/independent-secrets.txt        # 本脚本自己从私钥文件取的秘密
mkdir -p "$OUT" "$MAN" "$SUITE_TMP"
cd "$ROOT"
unset OMNE_TEST_PG_URL OMNE_E2E_KEEP OMNE_E2E_EVIDENCE_DIR OMNE_E2E_SECRETS_OUT
printf 'step\texit\tseconds\n' > "$OUT/exit-codes.tsv"

step() {
  local name=$1; shift
  local log=$OUT/$name.log
  {
    echo "\$ (cwd=$(pwd)) $*"
    echo "start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$log"
  local t0=$(date +%s)
  "$@" >> "$log" 2>&1
  local rc=$?
  local t1=$(date +%s)
  {
    echo "end: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "exit: $rc"
  } >> "$log"
  printf '%s\t%s\t%s\n' "$name" "$rc" "$((t1-t0))" >> "$OUT/exit-codes.tsv"
  return $rc
}

{
  echo "commit: $(git rev-parse HEAD)"
  echo "branch: $(git branch --show-current)"
  echo "git status --porcelain (before the run):"
  git status --porcelain
  echo "dist present before build: $(ls -d apps/*/dist packages/*/*/dist 2>/dev/null | wc -l)"
  echo "node: $(node --version)"
  echo "node openssl: $(node -p process.versions.openssl)"
  echo "system openssl: $(openssl version)"
  echo "pnpm: $(pnpm --version)"
  echo "kernel: $(uname -srm)"
  echo "cpus: $(nproc)"
  echo "suite TMPDIR: <WORK>/t (outside the repo, removed after the run)"
  echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT/environment.txt" 2>&1

# ---- 1. 从零复现 ----
step install pnpm install --frozen-lockfile --offline
step build pnpm run build
{
  echo "vitest: $(pnpm --filter @omne-harness-lite/tenancy-host exec vitest --version)"
  echo "typescript: $(pnpm --filter @omne-harness-lite/tenancy-host exec tsc --version)"
} >> "$OUT/environment.txt" 2>&1
step e2e env TMPDIR="$SUITE_TMP" OMNE_E2E_EVIDENCE_DIR="$RUN" OMNE_E2E_SECRETS_OUT="$SECRETS" \
  pnpm --filter @omne-harness-lite/tenancy-host run test:e2e \
  --reporter=verbose --reporter=json --outputFile.json="$OUT/e2e.json"

# ---- 2. 照 apps/tenancy-host/tests/e2e/README.md「手动起一个中心，再走一遍」 ----
manual() {
  local D=$WORK/m
  mkdir -p "$D"
  cd "$D" || return 90
  printf '[req]\nprompt = no\ndistinguished_name = dn\n[dn]\nCN = e2e-ca\n[v3_ca]\nbasicConstraints = critical,CA:TRUE\nkeyUsage = critical,keyCertSign,cRLSign\nsubjectKeyIdentifier = hash\n' > ca.cnf
  openssl req -x509 -config ca.cnf -extensions v3_ca -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout ca.key -out ca.pem -days 3 || return 91
  printf '[req]\nprompt = no\ndistinguished_name = dn\n[dn]\nCN = localhost\n' > center.cnf
  openssl req -new -config center.cnf -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout center.key -out center.csr || return 92
  printf 'subjectAltName = DNS:localhost,IP:127.0.0.1\nbasicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature\nextendedKeyUsage = serverAuth\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid\n' > center.ext
  openssl x509 -req -in center.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out center.pem -days 2 -sha256 -extfile center.ext || return 93
  cat center.pem ca.pem > center.chain.pem && chmod 600 center.key ca.key

  echo "\$ node <repo>/apps/tenancy-host/dist/cli.js keygen <D>/keys"
  node "$ROOT/apps/tenancy-host/dist/cli.js" keygen "$D/keys" > "$MAN/keygen.stdout.txt" 2> "$MAN/keygen.stderr.txt"
  echo "keygen exit: $?"
  OPS=$(mktemp -d /tmp/ops-XXXX)
  echo "ops dir mode: $(stat -c %a "$OPS")"

  local PORT=18443
  if ss -ltn | grep -q ":$PORT "; then PORT=18543; fi
  echo "entry port: $PORT"
  (
    export OMNE_TENANCY_STORAGE_FILE=$D/center.sqlite
    export OMNE_TENANCY_ACTIVATION_SIGNING_KEY_PEM_FILE=$D/keys/activation-signing-key.pem
    export OMNE_TENANCY_ACTIVATION_VERIFICATION_KEY_PEM_FILE=$D/keys/activation-verification-key.pem
    export OMNE_TENANCY_PURGE_SIGNING_KEY_PEM_FILE=$D/keys/purge-signing-key.pem
    export OMNE_TENANCY_PURGE_VERIFICATION_KEY_PEM_FILE=$D/keys/purge-verification-key.pem
    export OMNE_TENANCY_UNACTIVATED_RETENTION=P7D OMNE_TENANCY_INVITATION_TTL_DEFAULT=P14D
    export OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT=P14D OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT=P7D
    export OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT=P7D OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION=P1D
    export OMNE_TENANCY_CLOCK_READY_TIMEOUT=15000 OMNE_TENANCY_CREDENTIAL_POLICY='{"minLength":12}'
    export OMNE_TENANCY_ENTRY_LISTEN=127.0.0.1:$PORT
    export OMNE_TENANCY_ENTRY_TLS_CERT_CHAIN_PEM_FILE=$D/center.chain.pem
    export OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM_FILE=$D/center.key
    export OMNE_TENANCY_OPS_SOCKET_DIR=$OPS
    exec node "$ROOT/apps/tenancy-host/dist/cli.js" serve 2> "$D/center.jsonl"
  ) &
  local PID=$!
  echo "serve pid: $PID"
  local ready=no
  for _ in $(seq 1 120); do
    if curl -s --max-time 2 --unix-socket "$OPS/governance-center-ops.sock" http://localhost/ > "$MAN/health-ready.json" 2>/dev/null && [ -s "$MAN/health-ready.json" ]; then
      ready=yes; break
    fi
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.5
  done
  echo "ready: $ready"

  cd "$ROOT" || return 94
  echo "\$ node --experimental-strip-types apps/tenancy-host/tests/e2e/walk.ts 127.0.0.1:$PORT <D>/ca.pem"
  node --experimental-strip-types apps/tenancy-host/tests/e2e/walk.ts "127.0.0.1:$PORT" "$D/ca.pem" \
    > "$MAN/walk.stdout.txt" 2> "$MAN/walk.stderr.txt"
  local walk_rc=$?
  echo "walk exit: $walk_rc"
  curl -s --max-time 2 --unix-socket "$OPS/governance-center-ops.sock" http://localhost/ > "$MAN/health-after-walk.json"
  echo "health after walk: curl exit $?"

  kill -TERM "$PID"
  wait "$PID"
  echo "serve exit after SIGTERM: $?"
  cp "$D/center.jsonl" "$MAN/center.stderr.jsonl"
  rm -rf "$OPS"
  return $walk_rc
}
step manual manual
cd "$ROOT"

# ---- 3. 遮蔽：用本次跑出的秘密值 grep 本目录与上一次 run 目录 ----
node "$RUN/commands/secret-forms.mjs" "$SUITE_TMP" 2> "$WORK/harvest-suite.txt" | grep -v '^$' > "$WORK/indep-suite.txt"
node "$RUN/commands/secret-forms.mjs" "$WORK/m" 2> "$WORK/harvest-manual.txt" | grep -v '^$' > "$WORK/indep-manual.txt"
cat "$WORK/indep-suite.txt" "$WORK/indep-manual.txt" > "$INDEP"
{
  echo "suite-reported secret lines (OMNE_E2E_SECRETS_OUT, five forms each): $(grep -c . "$SECRETS")"
  echo "independent secret lines (private keys harvested by commands/secret-forms.mjs; five forms): $(grep -c . "$INDEP")"
  echo "  from the suite's temp root after the run: $(cat "$WORK/harvest-suite.txt")"
  echo "  from the manual center's directory: $(cat "$WORK/harvest-manual.txt")"
  echo "suite-harvested lines absent from the suite-reported list: $(grep -vxFc -f "$SECRETS" "$WORK/indep-suite.txt")"
  echo "manual-harvested lines absent from the suite-reported list (expected: all of them, the suite never saw these keys): $(grep -vxFc -f "$SECRETS" "$WORK/indep-manual.txt")"
  for list in suite independent; do
    case $list in suite) f=$SECRETS ;; independent) f=$INDEP ;; esac
    for dir in "$RUN" "$PREV"; do
      echo "\$ grep -rFl -f <$list secrets> ${dir#$ROOT/}"
      hits=$(grep -v '^$' "$f" | grep -rFl -f - "$dir")
      echo "files with a hit: $(printf '%s' "$hits" | grep -c .)"
      [ -n "$hits" ] && printf '%s\n' "$hits" | sed "s#$ROOT/##"
    done
    control=$WORK/control-$list
    head -n 1 "$f" > "$control"
    echo "control ($list: a file holding its first line) hit: $(grep -Fc -f "$f" "$control")"
  done
} > "$OUT/secret-grep.txt" 2>&1

# ---- 4. 与秘密值无关的结构核对（两个 run 目录） ----
node "$RUN/commands/scan-structure.mjs" "$RUN" > "$OUT/structure-this-run.txt" 2>&1
node "$RUN/commands/scan-structure.mjs" "$PREV" > "$OUT/structure-previous-run.txt" 2>&1

# ---- 5. 工程记录里的关联号对不对得上线上看得见的 AccountId／TenantId（两个 run 目录） ----
node "$RUN/commands/log-correlation.mjs" "$RUN" > "$OUT/log-correlation-this-run.txt" 2>&1
node "$RUN/commands/log-correlation.mjs" "$PREV" > "$OUT/log-correlation-previous-run.txt" 2>&1

rm -rf "$WORK"
echo "work dir removed: $([ -e "$WORK" ] && echo no || echo yes)" >> "$OUT/environment.txt"
echo "finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT/environment.txt"
