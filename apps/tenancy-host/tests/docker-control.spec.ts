import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const bash = process.env['OMNE_TEST_BASH'] ?? 'bash'
const script = fileURLToPath(new URL('../deploy/docker/omne-center', import.meta.url))
const supportsAssociativeArrays = spawnSync(bash, ['-c', 'declare -A values=()']).status === 0
const hasJq = spawnSync('jq', ['--version']).status === 0
const hasTimeout = spawnSync('timeout', ['--version']).status === 0

function invoke(action: string, args: readonly string[], checkAddress = false) {
  return spawnSync(
    bash,
    [
      '-c',
      'source "$1"; shift; parse "$@"; if [[ "$CHECK_ADDRESS" == true ]]; then validate_address; fi',
      'docker-control-test',
      script,
      action,
      ...args,
    ],
    { encoding: 'utf8', env: { ...process.env, CHECK_ADDRESS: String(checkAddress) } },
  )
}

it.skipIf(!supportsAssociativeArrays)(
  'rejects unsafe lifecycle inputs before Docker access',
  () => {
    const base = ['--project', 'office1']
    const invalidProject = invoke('status', ['--project', 'Office1'])
    expect(invalidProject.status).toBe(1)
    expect(invalidProject.stderr).toContain('invalid-project')

    const duplicate = invoke('status', [...base, '--project', 'office1'])
    expect(duplicate.status).toBe(64)

    const unexpected = invoke('status', [...base, '--image', 'latest'])
    expect(unexpected.status).toBe(64)

    const rootUid = invoke('verify', [
      ...base,
      '--image',
      'sha256:' + 'a'.repeat(64),
      '--state-dir',
      '/private/state',
      '--source',
      '/private/state/backups/a',
      '--work-dir',
      '/private/state/offline-work/a',
      '--uid',
      '0',
    ])
    expect(rootUid.status).toBe(1)
    expect(rootUid.stderr).toContain('invalid-uid')
  },
)

it.skipIf(!supportsAssociativeArrays)(
  'accepts only an explicit private or loopback publish address',
  () => {
    const args = [
      '--project',
      'office1',
      '--image',
      'sha256:' + 'a'.repeat(64),
      '--state-dir',
      '/private/state',
      '--secrets-dir',
      '/private/secrets',
      '--settings-file',
      '/private/settings.env',
      '--publish-port',
      '8443',
    ]
    expect(invoke('validate', [...args, '--publish-address', '127.0.0.1'], true).status).toBe(0)
    const wildcard = invoke('validate', [...args, '--publish-address', '0.0.0.0'], true)
    expect(wildcard.status).toBe(1)
    expect(wildcard.stderr).toContain('public-publish-address')
  },
)

it.skipIf(!supportsAssociativeArrays)('rejects caller Compose topology overrides', () => {
  const result = spawnSync(
    bash,
    ['-c', 'source "$1"; reject_compose_overrides', 'docker-control-test', script],
    { encoding: 'utf8', env: { ...process.env, COMPOSE_FILE: '/tmp/unreviewed.yaml' } },
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('compose-override-prohibited')
})

it.skipIf(!supportsAssociativeArrays)(
  'matches only the two reviewed Compose version strings',
  () => {
    for (const version of ['2.40.3', '2.40.3-desktop.1']) {
      expect(
        spawnSync(bash, [
          '-c',
          'source "$1"; compose_version_supported "$2"',
          'test',
          script,
          version,
        ]).status,
      ).toBe(0)
    }
    for (const version of ['2.40.30', '2.40.3-desktop.2', '2.40.3-unreviewed']) {
      expect(
        spawnSync(bash, [
          '-c',
          'source "$1"; compose_version_supported "$2"',
          'test',
          script,
          version,
        ]).status,
      ).toBe(1)
    }
  },
)

it.skipIf(!supportsAssociativeArrays)(
  'checks every canonical ancestor including newline paths and the existing work root',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-path-'))
    try {
      const work = join(root, 'line\nbreak', 'work')
      mkdirSync(work, { recursive: true })
      writeFileSync(join(root, 'line\nbreak', '.omne-isolated'), '')
      const check = (code: string) =>
        spawnSync(
          bash,
          [
            '-c',
            `source "$1"; realpath() { printf '%s\\n' "\${@: -1}"; }; ${code}`,
            'test',
            script,
            work,
          ],
          { encoding: 'utf8' },
        )
      const ancestor = check('canonical_existing "$2" work-dir true')
      expect(ancestor.status).toBe(1)
      expect(ancestor.stderr).toContain('isolated-work-dir-ancestor')
      rmSync(join(root, 'line\nbreak', '.omne-isolated'))
      writeFileSync(join(work, '.omne-isolated'), '')
      expect(check('work_dir="$2"; private_dir() { :; }; validate_existing_work_root').status).toBe(
        0,
      )
      rmSync(join(work, '.omne-isolated'))
      symlinkSync('missing-marker-target', join(work, '.omne-isolated'))
      const unsafeOwnMarker = check(
        'work_dir="$2"; private_dir() { :; }; validate_existing_work_root',
      )
      expect(unsafeOwnMarker.status).toBe(1)
      expect(unsafeOwnMarker.stderr).toContain('unsafe-work-marker')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

// 归慢层：子进程：逐个投影变体起 bash 子进程跑部署脚本的安全校验（含 jq）。
it.skipIf(!supportsAssociativeArrays || !hasJq)(
  'rejects added privilege, host PID, capabilities, and devices in both projections',
  { tags: ['slow'] },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-security-'))
    const image = 'sha256:' + 'a'.repeat(64)
    const config = (extra: Record<string, unknown> = {}) => ({
      services: {
        center: {
          image,
          user: '10001:10001',
          restart: 'unless-stopped',
          stop_signal: 'SIGTERM',
          stop_grace_period: '-1s',
          volumes: [
            { type: 'bind', source: '/state', target: '/state', read_only: false },
            { type: 'bind', source: '/secrets', target: '/secrets', read_only: true },
          ],
          tmpfs: ['/run/omne-tenancy'],
          ports: [{ host_ip: '127.0.0.1', published: '8443', target: 8443 }],
          environment: {
            OMNE_TENANCY_STORAGE_FILE: '/state/data/center.sqlite',
            OMNE_TENANCY_BACKUP_DIR: '/state/backups',
            OMNE_TENANCY_OPS_SOCKET_DIR: '/run/omne-tenancy',
            OMNE_TENANCY_ENTRY_LISTEN: '0.0.0.0:8443',
          },
          ...extra,
        },
      },
    })
    const actual = (
      extra: Record<string, unknown> = {},
      configExtra: Record<string, unknown> = {},
      mounts?: readonly Record<string, unknown>[],
    ) => [
      {
        Image: image,
        Config: {
          User: '10001:10001',
          StopTimeout: -1,
          StopSignal: 'SIGTERM',
          Healthcheck: { Test: ['CMD', 'node', '/opt/omne/app/deploy/docker/health.mjs'] },
          ...configExtra,
        },
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Privileged: false,
          PidMode: '',
          CapAdd: null,
          Devices: [],
          DeviceRequests: [],
          Tmpfs: { '/run/omne-tenancy': 'mode=0700,uid=10001,gid=10001,nosuid,nodev,noexec' },
          NetworkMode: 'default',
          PortBindings: { '8443/tcp': [{ HostIp: '127.0.0.1', HostPort: '8443' }] },
          ...extra,
        },
        Mounts: mounts ?? [
          { Type: 'bind', Source: '/state', Destination: '/state', RW: true },
          { Type: 'bind', Source: '/secrets', Destination: '/secrets', RW: false },
        ],
      },
    ]
    const run = (kind: 'config' | 'actual', payload: unknown) => {
      const fixture = join(root, 'projection.json')
      writeFileSync(fixture, JSON.stringify(payload))
      const command =
        kind === 'config'
          ? 'source "$1"; compose_center() { cat "$FIXTURE"; }; image="$IMAGE"; state_dir=/state; secrets_dir=/secrets; app_uid=10001; app_gid=10001; publish_address=127.0.0.1; publish_port=8443; validate_center_config'
          : 'source "$1"; verify_container_image() { :; }; desired_image_id="$IMAGE"; state_dir=/state; secrets_dir=/secrets; app_uid=10001; app_gid=10001; publish_address=127.0.0.1; publish_port=8443; validate_actual_center "$(cat "$FIXTURE")"'
      return spawnSync(bash, ['-c', command, 'test', script], {
        encoding: 'utf8',
        env: { ...process.env, FIXTURE: fixture, IMAGE: image },
      })
    }
    try {
      expect(run('config', config()).status).toBe(0)
      expect(run('actual', actual()).status).toBe(0)
      expect(
        run(
          'actual',
          actual({
            Tmpfs: { '/run/omne-tenancy': 'noexec,nodev,nosuid,gid=10001,uid=10001,mode=0700' },
          }),
        ).status,
      ).toBe(0)
      const fixedTmpfs = 'mode=0700,uid=10001,gid=10001,nosuid,nodev,noexec'
      for (const tmpfs of [
        null,
        {},
        { '/other': fixedTmpfs },
        { '/run/omne-tenancy': fixedTmpfs, '/other': fixedTmpfs },
        { '/run/omne-tenancy': 'mode=0700,uid=100010,gid=10001,nosuid,nodev,noexec' },
        { '/run/omne-tenancy': 'mode=0700,uid=10001,gid=100010,nosuid,nodev,noexec' },
        { '/run/omne-tenancy': 'mode=0701,uid=10001,gid=10001,nosuid,nodev,noexec' },
        { '/run/omne-tenancy': 'mode=0700,uid=10001,gid=10001,nosuid,nodev' },
        { '/run/omne-tenancy': 'mode=0700,uid=10001,gid=10001,nosuid,nodev,noexec,noexec' },
        { '/run/omne-tenancy': 'mode=0700,uid=10001,gid=10001,suid,nodev,noexec' },
        { '/run/omne-tenancy': 'mode=0700,uid=10001,gid=10001,nosuid,nodev,exec' },
        { '/run/omne-tenancy': ['mode=0700', 'uid=10001'] },
      ]) {
        expect(run('actual', actual({ Tmpfs: tmpfs })).status).toBe(1)
      }
      const binds = [
        { Type: 'bind', Source: '/state', Destination: '/state', RW: true },
        { Type: 'bind', Source: '/secrets', Destination: '/secrets', RW: false },
      ]
      expect(
        run(
          'actual',
          actual({}, {}, [...binds, { Type: 'tmpfs', Destination: '/run/omne-tenancy' }]),
        ).status,
      ).toBe(1)
      expect(
        run(
          'actual',
          actual({}, {}, [
            ...binds,
            { Type: 'bind', Source: '/extra', Destination: '/extra', RW: true },
          ]),
        ).status,
      ).toBe(1)
      expect(run('actual', actual({}, {}, binds.slice(0, 1))).status).toBe(1)
      for (const signal of ['', 'SIGKILL']) {
        expect(run('config', config({ stop_signal: signal })).status).toBe(1)
        expect(run('actual', actual({}, { StopSignal: signal })).status).toBe(1)
      }
      for (const [composeDelta, actualDelta] of [
        [{ privileged: true }, { Privileged: true }],
        [{ pid: 'host' }, { PidMode: 'host' }],
        [{ cap_add: ['SYS_ADMIN'] }, { CapAdd: ['SYS_ADMIN'] }],
        [{ devices: ['/dev/kvm'] }, { Devices: [{ PathOnHost: '/dev/kvm' }] }],
      ] as const) {
        expect(run('config', config(composeDelta)).status).toBe(1)
        expect(run('actual', actual(actualDelta)).status).toBe(1)
      }
      expect(run('actual', actual({ DeviceRequests: [{ Driver: 'nvidia' }] })).status).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it.skipIf(!supportsAssociativeArrays || !hasJq)(
  'rejects added privileges in maintenance config and the created container',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-maintenance-security-'))
    const image = 'sha256:' + 'a'.repeat(64)
    const buildId = 'b'.repeat(64)
    const source = join(root, 'source.json')
    const workRoot = join(root, 'offline-work')
    mkdirSync(workRoot)
    writeFileSync(source, '{}\n')
    const config = (extra: Record<string, unknown> = {}) => ({
      services: {
        maintenance: {
          image,
          user: '10001:10001',
          restart: 'no',
          stop_signal: 'SIGTERM',
          network_mode: 'none',
          volumes: [{ type: 'bind', source: root, target: '/state' }],
          ...extra,
        },
      },
    })
    const actual = (
      extra: Record<string, unknown> = {},
      identity: {
        image?: string
        user?: string
        version?: string
        build?: string
        distribution?: string
        stopSignal?: string
      } = {},
    ) => [
      {
        Image: identity.image ?? image,
        Config: {
          User: identity.user ?? '10001:10001',
          StopSignal: identity.stopSignal ?? 'SIGTERM',
          Labels: {
            'ai.nemori.omne.project': 'office1',
            'ai.nemori.omne.service': 'maintenance',
            'ai.nemori.omne.action': 'verify',
            'org.opencontainers.image.version': identity.version ?? '0.0.0',
            'ai.nemori.omne.host-build-id': identity.build ?? buildId,
            'ai.nemori.omne.distribution': identity.distribution ?? 'tenancy-host-docker/1',
          },
        },
        HostConfig: {
          RestartPolicy: { Name: 'no' },
          NetworkMode: 'none',
          PortBindings: null,
          Privileged: false,
          PidMode: '',
          CapAdd: null,
          Devices: [],
          DeviceRequests: [],
          ...extra,
        },
        Mounts: [{ Type: 'bind', Source: root, Destination: '/state' }],
      },
    ]
    const run = (kind: 'config' | 'actual', payload: unknown) => {
      const fixture = join(root, 'projection.json')
      writeFileSync(fixture, JSON.stringify(payload))
      const command =
        kind === 'config'
          ? 'source "$1"; project=office1; action=verify; image="$IMAGE"; state_dir="$STATE"; source_path="$SOURCE"; work_dir="$STATE/offline-work/work"; validate_state() { :; }; validate_image() { :; }; validate_offline_path() { :; }; private_dir() { :; }; compose_maintenance() { cat "$FIXTURE"; }; validate_offline'
          : 'source "$1"; project=office1; action=verify; image="$IMAGE"; image_id="$IMAGE"; image_version=0.0.0; image_build_id="$BUILD_ID"; state_dir="$STATE"; source_path="$SOURCE"; work_dir="$STATE/offline-work/work"; validate_offline() { :; }; compose_maintenance() { printf "%064d\\n" 0; }; docker_cli() { cat "$FIXTURE"; }; offline_wait() { :; }; run_offline'
      return spawnSync(bash, ['-c', command, 'test', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          FIXTURE: fixture,
          IMAGE: image,
          BUILD_ID: buildId,
          STATE: root,
          SOURCE: source,
        },
      })
    }
    try {
      expect(run('config', config()).status).toBe(0)
      expect(run('actual', actual()).status).toBe(0)
      for (const signal of ['', 'SIGKILL']) {
        expect(run('config', config({ stop_signal: signal })).stderr).toContain(
          'maintenance-compose-unsafe',
        )
        expect(run('actual', actual({}, { stopSignal: signal })).stderr).toContain(
          'maintenance-container-unsafe',
        )
      }
      for (const [composeDelta, actualDelta] of [
        [{ privileged: true }, { Privileged: true }],
        [{ pid: 'host' }, { PidMode: 'host' }],
        [{ cap_add: ['SYS_ADMIN'] }, { CapAdd: ['SYS_ADMIN'] }],
        [{ devices: ['/dev/kvm'] }, { Devices: [{ PathOnHost: '/dev/kvm' }] }],
      ] as const) {
        expect(run('config', config(composeDelta)).stderr).toContain('maintenance-compose-unsafe')
        expect(run('actual', actual(actualDelta)).stderr).toContain('maintenance-container-unsafe')
      }
      expect(run('actual', actual({ DeviceRequests: [{ Driver: 'nvidia' }] })).stderr).toContain(
        'maintenance-container-unsafe',
      )
      for (const changed of [
        { image: 'sha256:' + 'c'.repeat(64) },
        { user: '0:0' },
        { version: '9.9.9' },
        { build: 'c'.repeat(64) },
        { distribution: 'unreviewed' },
      ]) {
        expect(run('actual', actual({}, changed)).stderr).toContain('maintenance-container-unsafe')
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it.skipIf(!supportsAssociativeArrays || !hasJq || !hasTimeout)(
  'bounds the final startup health client and calls the checked health entry',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-health-'))
    try {
      const fakeDocker = join(root, 'docker')
      writeFileSync(
        fakeDocker,
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$(dirname "$0")/args"\nsleep 5\n',
        { mode: 0o700 },
      )
      const begun = Date.now()
      const result = spawnSync(
        bash,
        [
          '-c',
          'source "$1"; health_timeout=1s; center_id=example; bounded_full_health "$center_id"',
          'test',
          script,
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, PATH: `${root}:${process.env['PATH'] ?? ''}` },
          timeout: 3500,
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.status).not.toBe(0)
      expect(Date.now() - begun).toBeLessThan(3000)
      expect(readFileSync(join(root, 'args'), 'utf8')).toBe(
        'exec\nexample\nnode\n/opt/omne/app/deploy/docker/health.mjs\n',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

// 归慢层：子进程＋真实等待：每轮起 bash 子进程跑部署脚本的等待逻辑，按真实时长发信号并等它收尾。
it.skipIf(!supportsAssociativeArrays)(
  'waits after handled maintenance INT or TERM and preserves a task that completed first',
  { tags: ['slow'] },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-signal-'))
    const calls = join(root, 'calls')
    const clientPidFile = join(root, 'client-pid')
    try {
      const code = `
      source "$1"
      offline_id=$(printf '%064d' 0)
      offline_name=known-task
      offline_ready=true
      offline_temp=$(mktemp -d)
      marker="$2/stopped"; calls="$2/calls"
      trap offline_cleanup EXIT
      trap offline_signal INT TERM
      docker_wait_client() {
        if [[ "$PHASE" == lost ]]; then
          printf '%s\\n' "$BASHPID" > "$CLIENT_PID"
          exec sleep 30
        fi
        sleep 0.8; printf '0\\n'
      }
      docker_cli() {
        case "$1" in
          inspect)
            if [[ "$4" == *'.Id'* && "$4" == *ExitCode* ]]; then printf '%s exited 0\\n' "$offline_id"
            elif [[ "$PHASE" == exited ]]; then printf 'exited\\n'
            elif [[ -e "$marker" ]]; then printf 'exited\\n'
            else printf 'running\\n'; fi ;;
          kill)
            printf '%s %s\\n' "$2" "$3" >> "$calls"
            if [[ "$PHASE" != lost ]]; then touch "$marker"; fi
            [[ "$PHASE" != race && "$PHASE" != lost ]] ;;
          logs) printf '{"ok":true}\\n' ;;
        esac
      }
      (if [[ "$PHASE" == lost ]]; then while [[ ! -s "$CLIENT_PID" ]]; do sleep 0.01; done; fi
       sleep 0.2; kill -"$SIGNAL" "$$") &
      offline_wait
    `
      for (const [phase, signal] of [
        ['running', 'TERM'],
        ['exited', 'TERM'],
        ['race', 'TERM'],
        ['lost', 'TERM'],
        ['running', 'INT'],
      ] as const) {
        writeFileSync(calls, '')
        rmSync(join(root, 'stopped'), { force: true })
        const begun = Date.now()
        const result = spawnSync(bash, ['-c', code, 'test', script, root], {
          encoding: 'utf8',
          timeout: 3000,
          env: { ...process.env, PHASE: phase, SIGNAL: signal, CLIENT_PID: clientPidFile },
        })
        expect(result.error).toBeUndefined()
        if (phase === 'lost') {
          expect(result.status).toBe(1)
          expect(result.stdout).toBe('')
          expect(result.stderr).toContain('maintenance-outcome-unknown')
          expect(() =>
            process.kill(Number(readFileSync(clientPidFile, 'utf8').trim()), 0),
          ).toThrow()
        } else {
          expect(result.status, result.stderr).toBe(0)
          expect(Date.now() - begun).toBeGreaterThanOrEqual(650)
          expect(Date.now() - begun).toBeLessThan(2500)
          expect(result.stdout).toBe('{"ok":true}\n')
          expect(result.stderr).toContain('interrupted=true')
        }
        expect(readFileSync(calls, 'utf8')).toBe(
          phase === 'exited' ? '' : `--signal=SIGTERM ${'0'.repeat(64)}\n`,
        )
      }
    } finally {
      try {
        process.kill(Number(readFileSync(clientPidFile, 'utf8').trim()), 'SIGKILL')
      } catch {
        // The expected path has already reaped the client.
      }
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it.skipIf(!supportsAssociativeArrays)(
  'reports the named unverified task as unknown on TERM during create or inspect',
  () => {
    for (const phase of ['create', 'inspect']) {
      const code = `
      source "$1"
      project=office1; action=verify; state_dir=/state
      source_path=/state/backups/a; work_dir=/state/offline-work/a
      validate_offline() { :; }
      compose_maintenance() { if [[ "$PHASE" == create ]]; then sleep 3; fi; printf '%064d\\n' 0; }
      docker_cli() {
        if [[ "$1" == inspect ]]; then sleep 3; fi
        if [[ "$1" == kill ]]; then printf 'unexpected-kill\\n' >&2; return 77; fi
      }
      (sleep 0.2; kill -TERM "$$") &
      run_offline
    `
      const begun = Date.now()
      const result = spawnSync(bash, ['-c', code, 'test', script], {
        encoding: 'utf8',
        timeout: 2000,
        env: { ...process.env, PHASE: phase },
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(Date.now() - begun).toBeLessThan(1500)
      expect(result.stderr).toMatch(
        /maintenance-outcome-unknown name=omne-office1-verify-[0-9a-f]{16}/,
      )
      expect(result.stderr).not.toContain('unexpected-kill')
    }
  },
)

it.skipIf(!supportsAssociativeArrays)(
  'keeps maintenance results unknown when wait output is incomplete or invalid',
  () => {
    const code = `
      source "$1"
      offline_id=$(printf '%064d' 0)
      offline_temp=$(mktemp -d)
      trap offline_cleanup EXIT
      docker_wait_client() { printf '%s' "$WAIT_TEXT"; }
      docker_cli() {
        printf 'unexpected-docker-call\\n' >&2; return 77
      }
      offline_wait
    `
    for (const output of ['', '0', '0\n1\n', '256\n']) {
      const result = spawnSync(bash, ['-c', code, 'test', script], {
        encoding: 'utf8',
        env: { ...process.env, WAIT_TEXT: output },
      })
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('maintenance-exit-unavailable')
      expect(result.stderr).not.toContain('unexpected-docker-call')
    }
  },
)

it.skipIf(!supportsAssociativeArrays || !hasJq)(
  'does not claim a manual stop intent from an already exited center',
  () => {
    const id = '0'.repeat(64)
    const result = spawnSync(
      bash,
      [
        '-c',
        'source "$1"; docker_cli() { [[ "$1" == inspect ]] || exit 99; printf "[{\\"Id\\":\\"%s\\",\\"State\\":{\\"Status\\":\\"exited\\",\\"ExitCode\\":0}}]\\n" "$2"; }; normal_stop "$2"',
        'test',
        script,
        id,
      ],
      { encoding: 'utf8' },
    )
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      state: 'stop-intent-unconfirmed',
      containerId: id,
      exitCode: 0,
    })
  },
)

// 归慢层：子进程：逐个变体起 bash 子进程跑部署脚本的停机流程（含 jq）。
it.skipIf(!supportsAssociativeArrays || !hasJq)(
  'sends one explicit TERM and requires a complete wait code matching the same exited ID',
  { tags: ['slow'] },
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-stop-r5-'))
    const id = '0'.repeat(64)
    const alternateId = '1'.repeat(64)
    const calls = join(root, 'calls')
    const counter = join(root, 'inspect-count')
    const code = `
      source "$1"
      docker_wait_client() {
        printf 'wait %s\\n' "$1" >> "$CALLS"
        printf '%s' "$WAIT_TEXT"
        [[ "$WAIT_FAIL" != true ]]
      }
      docker_cli() {
        case "$1" in
          inspect)
            count=$(cat "$COUNT"); count=$((count + 1)); printf '%s\\n' "$count" > "$COUNT"
            if (( count == 1 )); then
              printf '[{"Id":"%s","State":{"Status":"%s","ExitCode":0}}]\\n' "$ID" "$INITIAL"
            else
              [[ "$INSPECT_FAIL" == true ]] && return 1
              printf '[{"Id":"%s","State":{"Status":"%s","ExitCode":%s}}]\\n' "$POST_ID" "$POST_STATE" "$POST_CODE"
            fi ;;
          kill)
            printf 'kill %s %s\\n' "$2" "$3" >> "$CALLS"
            [[ "$KILL_FAIL" != true ]] ;;
        esac
      }
      normal_stop "$2"
    `
    const run = (overrides: Record<string, string> = {}) => {
      writeFileSync(counter, '0\n')
      writeFileSync(calls, '')
      const result = spawnSync(bash, ['-c', code, 'test', script, id], {
        encoding: 'utf8',
        env: {
          ...process.env,
          ID: id,
          POST_ID: id,
          INITIAL: 'running',
          POST_STATE: 'exited',
          POST_CODE: '0',
          WAIT_TEXT: '0\n',
          INSPECT_FAIL: 'false',
          KILL_FAIL: 'false',
          WAIT_FAIL: 'false',
          COUNT: counter,
          CALLS: calls,
          ...overrides,
        },
      })
      return { result, calls: readFileSync(calls, 'utf8') }
    }
    try {
      for (const [initial, exitCode] of [
        ['running', 0],
        ['restarting', 1],
      ] as const) {
        const { result, calls: requests } = run({
          INITIAL: initial,
          WAIT_TEXT: `${exitCode}\n`,
          POST_CODE: String(exitCode),
        })
        expect(result.status).toBe(exitCode === 0 ? 0 : 1)
        expect(result.stdout).toBe(
          JSON.stringify({
            state: exitCode === 0 ? 'stopped' : 'stopped-with-error',
            containerId: id,
            exitCode,
            clean: exitCode === 0,
          }) + '\n',
        )
        expect(requests).toBe(`kill --signal=SIGTERM ${id}\nwait ${id}\n`)
      }
      for (const text of ['', '0', '0\n1\n', '0\nextra', 'garbage\n', '-1\n', '256\n']) {
        const { result, calls: requests } = run({ WAIT_TEXT: text })
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('stop-outcome-unknown')
        expect(requests).toBe(`kill --signal=SIGTERM ${id}\nwait ${id}\n`)
      }
      for (const overrides of [
        { POST_CODE: '1' },
        { POST_ID: alternateId },
        { POST_STATE: 'running' },
        { INSPECT_FAIL: 'true' },
        { WAIT_FAIL: 'true' },
      ]) {
        const { result, calls: requests } = run(overrides)
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('stop-outcome-unknown')
        expect(requests).toBe(`kill --signal=SIGTERM ${id}\nwait ${id}\n`)
      }
      const failedRequest = run({ KILL_FAIL: 'true' })
      expect(failedRequest.result.status).toBe(1)
      expect(failedRequest.result.stderr).toContain('stop-outcome-unknown')
      expect(failedRequest.calls).toBe(`kill --signal=SIGTERM ${id}\n`)
      for (const initial of ['created', 'dead']) {
        const unsupported = run({ INITIAL: initial })
        expect(unsupported.result.status).toBe(1)
        expect(unsupported.result.stderr).toContain('stop-state-invalid')
        expect(unsupported.calls).toBe('')
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it.skipIf(!supportsAssociativeArrays)(
  'removes only the temporary wait result when the center client is interrupted',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-stop-temp-'))
    const id = '0'.repeat(64)
    const clientPidFile = join(root, 'client-pid')
    const code = `
      source "$1"
      docker_wait_client() { printf '%s\\n' "$BASHPID" > "$CLIENT_PID"; exec sleep 30; }
      docker_cli() {
        case "$1" in
          inspect) printf '[{"Id":"%s","State":{"Status":"running"}}]\\n' "$2" ;;
          kill) : ;;
        esac
      }
      (while [[ ! -s "$CLIENT_PID" ]]; do sleep 0.01; done; kill -TERM "$$") &
      normal_stop "$2"
    `
    try {
      const result = spawnSync(bash, ['-c', code, 'test', script, id], {
        encoding: 'utf8',
        timeout: 3000,
        env: { ...process.env, TMPDIR: root, CLIENT_PID: clientPidFile },
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('stop-outcome-unknown')
      const clientPid = Number(readFileSync(clientPidFile, 'utf8').trim())
      expect(() => process.kill(clientPid, 0)).toThrow()
      expect(readdirSync(root)).toEqual(['client-pid'])
    } finally {
      try {
        process.kill(Number(readFileSync(clientPidFile, 'utf8').trim()), 'SIGKILL')
      } catch {
        // The expected path has already reaped the client.
      }
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it.skipIf(!supportsAssociativeArrays || !hasJq)(
  'reports the final stop fact on stderr while failed starts remain failures',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'omne-control-start-stop-'))
    const id = '0'.repeat(64)
    const counter = join(root, 'inspect-count')
    const code = `
      source "$1"
      project=office1; startup_wait=0; observation_interval=1
      image_id="sha256:$(printf '%064d' 1)"; image_build_id=$(printf '%064d' 2)
      select_count=0
      lock_project() { :; }
      select_center() {
        select_count=$((select_count + 1))
        if (( select_count == 1 )); then center_id=''
        else center_id="$ID"; center_inspect='[{"State":{"StartedAt":"old"},"RestartCount":0}]'; fi
      }
      validate_inputs() { :; }
      validate_actual_center() { :; }
      compose_center() { :; }
      sleep() { SECONDS=$((SECONDS + 2)); }
      docker_wait_client() { printf '%s\\n' "$EXIT_CODE"; }
      docker_cli() {
        case "$1" in
          start|kill) return 0 ;;
          inspect)
            count=$(cat "$COUNT")
            count=$((count + 1)); printf '%s\\n' "$count" > "$COUNT"
            if [[ "$MODE" == unknown && "$count" == 2 ]]; then return 1; fi
            if [[ "$MODE" == process-failed || "$count" -ge 3 ]]; then
              printf '[{"Id":"%s","State":{"Status":"exited","ExitCode":%s}}]\\n' "$ID" "$EXIT_CODE"
            else
              printf '[{"Id":"%s","State":{"Status":"running","Running":true,"Restarting":false,"Pid":10,"StartedAt":"new","Health":{"Status":"starting"}},"RestartCount":0}]\\n' "$ID"
            fi ;;
        esac
      }
      start_center
    `
    const run = (mode: string, exitCode: number) => {
      writeFileSync(counter, '0\n')
      return spawnSync(bash, ['-c', code, 'test', script], {
        encoding: 'utf8',
        env: { ...process.env, ID: id, COUNT: counter, MODE: mode, EXIT_CODE: String(exitCode) },
      })
    }
    try {
      for (const exitCode of [0, 1]) {
        const result = run('observation-expired', exitCode)
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('startup-observation-expired')
        expect(result.stderr).toContain(
          JSON.stringify({
            state: exitCode === 0 ? 'stopped' : 'stopped-with-error',
            containerId: id,
            exitCode,
            clean: exitCode === 0,
          }),
        )
      }
      const unknown = run('unknown', 0)
      expect(unknown.status).toBe(1)
      expect(unknown.stdout).toBe('')
      expect(unknown.stderr).toContain('startup-observation-expired')
      expect(unknown.stderr).toContain('stop-outcome-unknown')

      const processFailed = run('process-failed', 1)
      expect(processFailed.status).toBe(1)
      expect(processFailed.stdout).toBe('')
      expect(processFailed.stderr).toContain('startup-process-failed')
      expect(processFailed.stderr).toContain(
        JSON.stringify({ state: 'stop-intent-unconfirmed', containerId: id, exitCode: 1 }),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)
