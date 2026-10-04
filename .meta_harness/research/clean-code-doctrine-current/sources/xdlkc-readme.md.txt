# Uncle Bob assembly-line for DeepSeek Harness

Out-of-tree DSH bundle. A TypeScript FSM runs **Specifier → Coder → Cleaner → Hardener → QA** as fresh `spawn` children. Host gates own PASS.

## Install and run

DSH `@deepseek-ai/dsh-*` stay in-box. `dsh plugin add` for an **unknown** profile name initializes **only** `@deepseek-ai/dsh-base`. Copy a `web` or `headless` template, then add this bundle.

From a **built** harness checkout (`pnpm run build` if `lib/` is required for the launcher you use):

```sh
# 0. Harness home
# Default: ~/.dsh   override: DSH_HOME

# 1. Web profile (human watches children)
pnpm dsh --profile web --dump-config >/dev/null
cp -R "${DSH_HOME:-$HOME/.dsh}/profiles/web" "${DSH_HOME:-$HOME/.dsh}/profiles/uncle-bob"
# optional: set "name": "dsh-profile-uncle-bob" in that profile package.json
pnpm dsh plugin --profile uncle-bob add /Users/lkc/Code/uncle-bob-harness
pnpm dsh --profile uncle-bob --dump-config | head   # expect "# == uncle-bob-harness"

# If pnpm ≥10 blocks prepare:
#   add to ~/.dsh/profiles/uncle-bob/pnpm-workspace.yaml
#     allowBuilds:
#       uncle-bob-harness: true
#   then re-run the add.

# 2. Run web, open the workspace at the fixture
cd /Users/lkc/Code/uncle-bob-harness/fixtures/fizzbuzz
pnpm install   # fixture deps: vitest, cucumber, typescript, stryker
# from harness checkout:
pnpm dsh --profile uncle-bob
# In the web composer:
# /story Implement FizzBuzz for n=1..100. Multiples of 3 → Fizz, 5 → Buzz, both → FizzBuzz, else the number. Public function fizzBuzz(n: number): string.
```

Headless repeat:

```sh
pnpm dsh --profile headless --dump-config >/dev/null
cp -R "${DSH_HOME:-$HOME/.dsh}/profiles/headless" "${DSH_HOME:-$HOME/.dsh}/profiles/uncle-bob-headless"
pnpm dsh plugin --profile uncle-bob-headless add /Users/lkc/Code/uncle-bob-harness

cd /Users/lkc/Code/uncle-bob-harness/fixtures/fizzbuzz
pnpm dsh --profile uncle-bob-headless "Implement FizzBuzz for n=1..100. Multiples of 3 → Fizz, 5 → Buzz, both → FizzBuzz, else the number. Public function fizzBuzz(n: number): string."
echo $?    # 0 passed, 1 blocked
cat .uncle-bob/story-*/REPORT.md
```

Needs `DEEPSEEK_API_KEY` (and optional `DEEPSEEK_BASE_URL`) in the environment or harness-home `.env`, same as other real-API dsh runs.

Wrong: `pnpm dsh plugin --profile uncle-bob add …` **without** copying the web template first — that profile is base-only (no browser, no `/story` UI).

Headless stdout stays empty (no parent assistant message). Read `REPORT.md` and the exit code. stderr prints `uncle-bob: passed story-…` or `uncle-bob: blocked …`.

## Develop this bundle

```sh
pnpm install
pnpm test
pnpm run build
```
