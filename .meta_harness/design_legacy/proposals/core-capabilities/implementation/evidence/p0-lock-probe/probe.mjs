#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  statfsSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SOURCE_REVISION = 'e11cc6990c1354e7baf138cc2f501effc7b413f6';
const FS_EXT = Object.freeze({
  name: 'fs-ext',
  version: '2.1.1',
  repository: 'https://github.com/baudehlo/node-fs-ext.git',
  tag: 'v2.1.1',
  tagCommit: 'aded976099c2b06c944f0897a9b004dbf266e234',
  tarball: 'https://registry.npmjs.org/fs-ext/-/fs-ext-2.1.1.tgz',
  sha1: 'f60bdb6506681ccc21e5ea5623bc990dd0216fd7',
  integrity:
    'sha512-/TrISPOFhCkbgIRWK9lzscRzwPCu0PqtCcvMc9jsHKBgZGoqA0VzhspVht5Zu8lxaXjIYIBWILHpRotYkCCcQA==',
  installScript: 'node-gyp configure build',
});

const EXPECTED_BLOCK_CODES = new Set(['EAGAIN', 'EACCES', 'EWOULDBLOCK']);
const managedChildren = new Set();

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${value}`);
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function serializeError(error) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    stack: error.stack,
  };
}

function hash(buffer, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function syncDirectory(directory, syncBoundaries, reason) {
  const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(fd);
    syncBoundaries.push({ kind: 'directory', path: directory, reason, acknowledged: true });
  } finally {
    closeSync(fd);
  }
}

function writeFully(fd, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset, null);
    if (written === 0) {
      throw new Error(`zero-byte write at offset ${offset}`);
    }
    offset += written;
  }
}

function command(binary, args, cwd, environment = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(binary, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    maxBuffer: 16 * 1024 * 1024,
  });
  const record = {
    argv: [binary, ...args],
    cwd,
    startedAt,
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    spawnError: result.error ? serializeError(result.error) : undefined,
  };
  if (result.error || result.status !== 0) {
    const error = new Error(`command failed: ${[binary, ...args].join(' ')}`);
    error.commandRecord = record;
    throw error;
  }
  return record;
}

function commandVersion(binary, args = ['--version']) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  return {
    argv: [binary, ...args],
    exitCode: result.status,
    stdout: result.stdout?.trim(),
    stderr: result.stderr?.trim(),
    spawnError: result.error ? serializeError(result.error) : undefined,
  };
}

async function download(url) {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function tryLoadFsExt(sandbox) {
  const sandboxRequire = createRequire(path.join(sandbox, 'package.json'));
  try {
    const module = sandboxRequire('fs-ext');
    return {
      loaded: true,
      module,
      resolved: sandboxRequire.resolve('fs-ext'),
      exports: Object.keys(module).sort(),
    };
  } catch (error) {
    return { loaded: false, error: serializeError(error) };
  }
}

async function prepareDependency(sandbox, commands) {
  const sourceDirectory = path.join(sandbox, 'source');
  mkdirSync(sourceDirectory, { recursive: true });

  const metadataBuffer = await download('https://registry.npmjs.org/fs-ext/2.1.1');
  const metadata = JSON.parse(metadataBuffer.toString('utf8'));
  assert.equal(metadata.name, FS_EXT.name);
  assert.equal(metadata.version, FS_EXT.version);
  assert.equal(metadata.scripts.install, FS_EXT.installScript);
  assert.equal(metadata.dist.shasum, FS_EXT.sha1);
  assert.equal(metadata.dist.integrity, FS_EXT.integrity);

  const tarball = await download(FS_EXT.tarball);
  const tarballSha1 = hash(tarball, 'sha1');
  const tarballIntegrity = `sha512-${hash(tarball, 'sha512', 'base64')}`;
  assert.equal(tarballSha1, FS_EXT.sha1);
  assert.equal(tarballIntegrity, FS_EXT.integrity);
  const tarballPath = path.join(sourceDirectory, 'fs-ext-2.1.1.tgz');
  writeFileSync(tarballPath, tarball);

  const tagLookup = command(
    'git',
    ['ls-remote', '--refs', FS_EXT.repository, `refs/tags/${FS_EXT.tag}`],
    sandbox,
  );
  commands.push(tagLookup);
  const [tagCommit] = tagLookup.stdout.trim().split(/\s+/u);
  assert.equal(tagCommit, FS_EXT.tagCommit);

  const packageManifest = {
    name: 'omne-p0-lock-probe-sandbox',
    version: '0.0.0',
    private: true,
    engines: { node: '>=24 <25' },
    packageManager: 'pnpm@10.28.1',
    dependencies: { 'fs-ext': 'file:./source/fs-ext-2.1.1.tgz' },
    pnpm: { onlyBuiltDependencies: ['fs-ext'] },
  };
  writeFileSync(path.join(sandbox, 'package.json'), `${JSON.stringify(packageManifest, null, 2)}\n`);

  const controlledEnvironment = {
    npm_config_cache: path.join(sandbox, '.npm-cache'),
    npm_config_devdir: path.join(sandbox, '.node-gyp'),
    XDG_CACHE_HOME: path.join(sandbox, '.cache'),
  };
  const storeDirectory = path.join(sandbox, '.pnpm-store');
  commands.push(
    command(
      'pnpm',
      [
        'install',
        '--ignore-workspace',
        '--ignore-scripts',
        '--store-dir',
        storeDirectory,
        '--reporter',
        'append-only',
      ],
      sandbox,
      controlledEnvironment,
    ),
  );

  const addonPath = path.join(sandbox, 'node_modules/fs-ext/build/Release/fs_ext.node');
  const addonPresentAfterScriptDisabledInstall = existsSync(addonPath);
  const loadBeforeBuild = tryLoadFsExt(sandbox);
  assert.equal(addonPresentAfterScriptDisabledInstall, false);
  assert.equal(loadBeforeBuild.loaded, false);

  commands.push(
    command(
      'pnpm',
      [
        'rebuild',
        'fs-ext',
        '--pending',
        '--ignore-workspace',
        '--store-dir',
        storeDirectory,
        '--reporter',
        'append-only',
      ],
      sandbox,
      controlledEnvironment,
    ),
  );

  assert.equal(existsSync(addonPath), true);
  const loadAfterBuild = tryLoadFsExt(sandbox);
  assert.equal(loadAfterBuild.loaded, true);
  assert.equal(typeof loadAfterBuild.module.flock, 'function');
  assert.equal(typeof loadAfterBuild.module.flockSync, 'function');

  const installedManifestPath = path.join(sandbox, 'node_modules/fs-ext/package.json');
  const installedManifestBuffer = readFileSync(installedManifestPath);
  const installedManifest = JSON.parse(installedManifestBuffer.toString('utf8'));
  assert.equal(installedManifest.version, FS_EXT.version);
  assert.equal(installedManifest.scripts.install, FS_EXT.installScript);

  return {
    registryMetadataUrl: 'https://registry.npmjs.org/fs-ext/2.1.1',
    repository: FS_EXT.repository,
    tag: FS_EXT.tag,
    tagCommit,
    tarballUrl: FS_EXT.tarball,
    tarballBytes: tarball.length,
    tarballSha1,
    tarballIntegrity,
    installScript: installedManifest.scripts.install,
    engines: installedManifest.engines,
    licenses: installedManifest.licenses,
    dependencies: installedManifest.dependencies,
    addonPresentAfterScriptDisabledInstall,
    loadBeforeBuild: { loaded: loadBeforeBuild.loaded, error: loadBeforeBuild.error },
    loadAfterBuild: {
      loaded: loadAfterBuild.loaded,
      resolved: loadAfterBuild.resolved,
      exports: loadAfterBuild.exports,
    },
    installedManifestSha256: hash(installedManifestBuffer, 'sha256'),
    nativeAddonPath: addonPath,
    nativeAddonSha256: hash(readFileSync(addonPath), 'sha256'),
    module: loadAfterBuild.module,
  };
}

class ManagedChild {
  constructor(role, lockPath, sandbox) {
    this.messages = [];
    this.waiters = [];
    this.stderr = '';
    this.stdout = '';
    this.child = spawn(
      process.execPath,
      [SCRIPT_PATH, '--child', role, '--lock-path', lockPath, '--sandbox', sandbox],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    );
    managedChildren.add(this.child);
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      this.stdout += chunk;
    });
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
    this.child.on('message', (message) => {
      this.messages.push(message);
      this.flushWaiters();
    });
    this.exit = new Promise((resolve) => {
      this.child.once('exit', (code, signal) => {
        managedChildren.delete(this.child);
        this.flushWaiters();
        resolve({ code, signal, stdout: this.stdout, stderr: this.stderr });
      });
    });
  }

  flushWaiters() {
    for (const waiter of [...this.waiters]) {
      const match = this.messages.find(waiter.predicate);
      if (match !== undefined) {
        clearTimeout(waiter.timer);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(match);
      } else if (this.child.exitCode !== null || this.child.signalCode !== null) {
        clearTimeout(waiter.timer);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.reject(
          new Error(
            `child ${this.child.pid} exited before expected message; stdout=${this.stdout}; stderr=${this.stderr}`,
          ),
        );
      }
    }
  }

  waitFor(type, timeoutMs = 10_000) {
    const existing = this.messages.find((message) => message.type === type);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate: (message) => message.type === type,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error(`timed out waiting for ${type} from child ${this.child.pid}`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  send(commandName) {
    this.child.send({ command: commandName });
  }
}

async function expectCleanExit(managed, expectedSignal = null) {
  const exit = await managed.exit;
  if (expectedSignal !== null) {
    assert.equal(exit.signal, expectedSignal);
  } else {
    assert.equal(exit.code, 0, `child stderr: ${exit.stderr}`);
  }
  return exit;
}

async function runContender(lockPath, sandbox) {
  const contender = new ManagedChild('contender', lockPath, sandbox);
  const result = await contender.waitFor('contender_result');
  await expectCleanExit(contender);
  return result;
}

function lockIdentity(lockPath) {
  const stat = statSync(lockPath);
  return { device: stat.dev.toString(), inode: stat.ino.toString(), size: stat.size };
}

function assertStableLockIdentity(lockPath, initialIdentity) {
  const current = lockIdentity(lockPath);
  assert.equal(current.device, initialIdentity.device);
  assert.equal(current.inode, initialIdentity.inode);
  return current;
}

async function waitUntilStopped(pid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const state = /^State:\s+(.+)$/mu.exec(status)?.[1];
    if (state?.startsWith('T')) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`process ${pid} did not enter stopped state`);
}

function assertBlocked(result) {
  assert.equal(result.outcome, 'blocked');
  assert.equal(EXPECTED_BLOCK_CODES.has(result.error.code), true, JSON.stringify(result.error));
}

function assertAcquired(result) {
  assert.equal(result.outcome, 'acquired');
}

async function runLockScenarios(lockPath, sandbox, fsExt, initialIdentity) {
  const scenarios = [];

  {
    const holder = new ManagedChild('holder', lockPath, sandbox);
    const locked = await holder.waitFor('locked');
    const contender = await runContender(lockPath, sandbox);
    assertBlocked(contender);
    holder.send('unlock_and_exit');
    const released = await holder.waitFor('released');
    await expectCleanExit(holder);
    scenarios.push({
      name: 'two_process_exclusion',
      passed: true,
      holderPid: locked.pid,
      contenderPid: contender.pid,
      contender,
      release: released.method,
      lockIdentity: assertStableLockIdentity(lockPath, initialIdentity),
    });
  }

  {
    const firstFd = openSync(lockPath, constants.O_RDWR);
    const secondFd = openSync(lockPath, constants.O_RDWR);
    let blockedError;
    try {
      fsExt.flockSync(firstFd, 'exnb');
      try {
        fsExt.flockSync(secondFd, 'exnb');
      } catch (error) {
        blockedError = serializeError(error);
      }
      assert.ok(blockedError);
      assert.equal(EXPECTED_BLOCK_CODES.has(blockedError.code), true);
      fsExt.flockSync(firstFd, 'un');
      fsExt.flockSync(secondFd, 'exnb');
      fsExt.flockSync(secondFd, 'un');
    } finally {
      closeSync(secondFd);
      closeSync(firstFd);
    }
    scenarios.push({
      name: 'same_process_independent_open_file_descriptions_are_exclusive',
      passed: true,
      processPid: process.pid,
      firstFd,
      secondFd,
      blockedError,
      secondFdAcquiredAfterFirstUnlock: true,
      lockIdentity: assertStableLockIdentity(lockPath, initialIdentity),
    });
  }

  {
    const holder = new ManagedChild('holder', lockPath, sandbox);
    const locked = await holder.waitFor('locked');
    process.kill(holder.child.pid, 'SIGSTOP');
    const procState = await waitUntilStopped(holder.child.pid);
    const whileStopped = await runContender(lockPath, sandbox);
    assertBlocked(whileStopped);
    process.kill(holder.child.pid, 'SIGKILL');
    const death = await expectCleanExit(holder, 'SIGKILL');
    const afterDeath = await runContender(lockPath, sandbox);
    assertAcquired(afterDeath);
    scenarios.push({
      name: 'sigstop_retains_lock_and_sigkill_releases_it',
      passed: true,
      holderPid: locked.pid,
      stoppedProcState: procState,
      whileStopped,
      deathSignal: death.signal,
      afterDeath,
      lockIdentity: assertStableLockIdentity(lockPath, initialIdentity),
    });
  }

  {
    const holder = new ManagedChild('holder', lockPath, sandbox);
    const locked = await holder.waitFor('locked');
    const beforeClose = await runContender(lockPath, sandbox);
    assertBlocked(beforeClose);
    holder.send('close_only');
    const released = await holder.waitFor('released');
    assert.equal(released.method, 'close');
    const afterClose = await runContender(lockPath, sandbox);
    assertAcquired(afterClose);
    assert.equal(holder.child.exitCode, null);
    holder.send('exit');
    await expectCleanExit(holder);
    scenarios.push({
      name: 'closing_descriptor_releases_lock_while_holder_process_remains_alive',
      passed: true,
      holderPid: locked.pid,
      beforeClose,
      release: released.method,
      afterClose,
      holderWasAliveAfterClose: true,
      lockIdentity: assertStableLockIdentity(lockPath, initialIdentity),
    });
  }

  return scenarios;
}

function runRoundTrip(domainDirectory, syncBoundaries) {
  const journalDirectory = path.join(domainDirectory, 'journal');
  mkdirSync(journalDirectory);
  syncDirectory(domainDirectory, syncBoundaries, 'persist newly created journal directory entry');

  const record = {
    probeFormat: 'p0-lock-probe/1',
    sequence: 1,
    operation: 'minimal-complete-record-round-trip',
    payload: {
      text: '完整记录 / flock probe',
      values: [0, false, null, ''],
    },
  };
  const encoded = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  const recordPath = path.join(journalDirectory, 'record.jsonl');
  const fd = openSync(recordPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFully(fd, encoded);
    fsyncSync(fd);
    syncBoundaries.push({
      kind: 'file',
      path: recordPath,
      reason: 'acknowledge complete record bytes before read-back',
      acknowledged: true,
    });
  } finally {
    closeSync(fd);
  }
  syncDirectory(journalDirectory, syncBoundaries, 'persist newly created record file entry');

  const readBack = readFileSync(recordPath);
  assert.equal(readBack.at(-1), 0x0a);
  assert.equal(readBack.equals(encoded), true);
  const decoded = JSON.parse(readBack.subarray(0, -1).toString('utf8'));
  assert.equal(isDeepStrictEqual(decoded, record), true);
  return {
    passed: true,
    probeOnlyFormat: record.probeFormat,
    recordPath,
    encodedBytes: encoded.length,
    encodedSha256: hash(encoded, 'sha256'),
    exactByteRoundTrip: true,
    terminalLfPresent: true,
    deepRecordRoundTrip: true,
    record,
  };
}

function collectEnvironment(sandbox) {
  let nodeExecutable = process.execPath;
  try {
    nodeExecutable = readlinkSync('/proc/self/exe');
  } catch {
    // /proc is present in the tested Linux environment; keep process.execPath if it cannot be read.
  }
  const filesystem = statfsSync(sandbox);
  return {
    node: {
      version: process.version,
      executable: nodeExecutable,
      moduleAbi: process.versions.modules,
      napi: process.versions.napi,
      v8: process.versions.v8,
    },
    pnpm: commandVersion('pnpm'),
    npm: commandVersion('npm'),
    os: {
      platform: process.platform,
      architecture: process.arch,
      release: os.release(),
      version: os.version(),
      machine: os.machine(),
    },
    filesystem: {
      statfsTypeDecimal: filesystem.type.toString(),
      statfsTypeHex: `0x${filesystem.type.toString(16)}`,
      blockSize: filesystem.bsize.toString(),
      blocks: filesystem.blocks.toString(),
    },
    mount: commandVersion('findmnt', [
      '-T',
      sandbox,
      '-o',
      'TARGET,SOURCE,FSTYPE,OPTIONS',
      '-n',
    ]),
    uname: commandVersion('uname', ['-a']),
    compiler: {
      ccEnvironment: process.env.CC,
      cxxEnvironment: process.env.CXX,
      gccExecPrefix: process.env.GCC_EXEC_PREFIX,
      pathEnvironment: process.env.PATH,
      defaultCxx: commandVersion('g++', ['--version']),
      selectedCxx: commandVersion(process.env.CXX ?? 'g++', ['--version']),
    },
    python: commandVersion('python3', ['--version']),
  };
}

async function childMain(args) {
  const sandboxRequire = createRequire(path.join(args.sandbox, 'package.json'));
  const { flock, flockSync } = sandboxRequire('fs-ext');
  const lockPath = path.resolve(args['lock-path']);
  const fd = openSync(lockPath, constants.O_RDWR);

  if (args.child === 'contender') {
    let message;
    try {
      flockSync(fd, 'exnb');
      message = { type: 'contender_result', outcome: 'acquired', pid: process.pid };
      flockSync(fd, 'un');
    } catch (error) {
      message = {
        type: 'contender_result',
        outcome: 'blocked',
        pid: process.pid,
        error: serializeError(error),
      };
    } finally {
      closeSync(fd);
    }
    process.send(message);
    process.disconnect();
    return;
  }

  if (args.child !== 'holder') {
    throw new Error(`unknown child role: ${args.child}`);
  }

  await new Promise((resolve, reject) => {
    flock(fd, 'ex', (error) => (error ? reject(error) : resolve()));
  });
  process.send({ type: 'locked', pid: process.pid, identity: lockIdentity(lockPath) });

  let open = true;
  process.on('message', (message) => {
    if (message.command === 'unlock_and_exit') {
      flockSync(fd, 'un');
      closeSync(fd);
      open = false;
      process.send({ type: 'released', method: 'explicit_unlock_then_close', pid: process.pid });
      process.disconnect();
    } else if (message.command === 'close_only') {
      closeSync(fd);
      open = false;
      process.send({ type: 'released', method: 'close', pid: process.pid });
    } else if (message.command === 'exit') {
      if (open) {
        closeSync(fd);
      }
      process.disconnect();
    }
  });
}

async function main(args) {
  if (!args.sandbox || !args.output) {
    throw new Error('usage: probe.mjs --sandbox ABSOLUTE_PATH --output ABSOLUTE_PATH');
  }
  const sandbox = path.resolve(args.sandbox);
  const output = path.resolve(args.output);
  assert.equal(path.isAbsolute(sandbox), true);
  assert.equal(path.isAbsolute(output), true);
  if (existsSync(sandbox)) {
    throw new Error(`sandbox already exists; use a fresh path: ${sandbox}`);
  }
  mkdirSync(sandbox, { recursive: true });
  mkdirSync(path.dirname(output), { recursive: true });

  const summary = {
    schema: 'omne-p0-lock-probe-summary/1',
    inputBaseline: SOURCE_REVISION,
    probeScriptSha256: hash(readFileSync(SCRIPT_PATH), 'sha256'),
    startedAt: new Date().toISOString(),
    status: 'failed',
    scope: {
      purpose:
        'P0 feasibility evidence for Linux native flock and a probe-only synced complete-record round trip',
      prerequisitesFor: ['A06', 'A07', 'A30', 'A31'],
      productAcceptanceClaimed: false,
      coreJournalCodecClaimed: false,
      powerLossDurabilityClaimed: false,
    },
    commands: [],
    cleanup: { managedChildrenRemaining: null, actions: [] },
  };

  try {
    summary.environment = collectEnvironment(sandbox);
    assert.match(process.version, /^v24\./u);
    summary.repositoryHead = command('git', ['rev-parse', 'HEAD'], process.cwd());
    summary.commands.push(summary.repositoryHead);
    summary.sourceRevisionAtExecution = summary.repositoryHead.stdout.trim();
    summary.baselineAncestry = command(
      'git',
      ['merge-base', '--is-ancestor', SOURCE_REVISION, summary.sourceRevisionAtExecution],
      process.cwd(),
    );
    summary.commands.push(summary.baselineAncestry);

    const dependency = await prepareDependency(sandbox, summary.commands);
    const fsExtModule = dependency.module;
    delete dependency.module;
    summary.dependency = dependency;

    const syncBoundaries = [];
    const dataRoot = path.join(sandbox, 'probe-data');
    mkdirSync(dataRoot);
    syncDirectory(sandbox, syncBoundaries, 'persist newly created probe-data directory entry');
    const domainDirectory = path.join(dataRoot, 'coordination-domain');
    mkdirSync(domainDirectory);
    syncDirectory(dataRoot, syncBoundaries, 'persist newly created coordination-domain directory entry');

    const lockPath = path.join(domainDirectory, 'writer.lock');
    const lockFd = openSync(
      lockPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
      0o600,
    );
    try {
      fsyncSync(lockFd);
      syncBoundaries.push({
        kind: 'file',
        path: lockPath,
        reason: 'acknowledge stable lock inode creation',
        acknowledged: true,
      });
    } finally {
      closeSync(lockFd);
    }
    syncDirectory(domainDirectory, syncBoundaries, 'persist newly created stable lock inode entry');
    const initialIdentity = lockIdentity(lockPath);

    summary.lock = {
      path: lockPath,
      initialIdentity,
      scenarios: await runLockScenarios(
        lockPath,
        sandbox,
        fsExtModule,
        initialIdentity,
      ),
      finalIdentity: assertStableLockIdentity(lockPath, initialIdentity),
      remainedPresent: existsSync(lockPath),
      deletedOrReplacedDuringProbe: false,
    };
    summary.roundTrip = runRoundTrip(domainDirectory, syncBoundaries);
    summary.syncBoundaries = syncBoundaries;
    summary.status = 'passed';
  } catch (error) {
    summary.failure = serializeError(error);
    if (error?.commandRecord) {
      summary.commands.push(error.commandRecord);
    }
  } finally {
    const childrenToClean = [...managedChildren];
    const exitWaits = childrenToClean.map((child) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve();
      }
      return new Promise((resolve) => child.once('exit', resolve));
    });
    for (const child of childrenToClean) {
      try {
        process.kill(child.pid, 'SIGCONT');
        summary.cleanup.actions.push({ pid: child.pid, signal: 'SIGCONT', accepted: true });
      } catch (error) {
        summary.cleanup.actions.push({
          pid: child.pid,
          signal: 'SIGCONT',
          accepted: false,
          error: serializeError(error),
        });
      }
      try {
        process.kill(child.pid, 'SIGKILL');
        summary.cleanup.actions.push({ pid: child.pid, signal: 'SIGKILL', accepted: true });
      } catch (error) {
        summary.cleanup.actions.push({
          pid: child.pid,
          signal: 'SIGKILL',
          accepted: false,
          error: serializeError(error),
        });
      }
    }
    await Promise.allSettled(exitWaits);
    summary.cleanup.managedChildrenRemaining = managedChildren.size;
    summary.completedAt = new Date().toISOString();
    writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (summary.status !== 'passed') {
    process.exitCode = 1;
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.child) {
  await childMain(args);
} else {
  await main(args);
}
