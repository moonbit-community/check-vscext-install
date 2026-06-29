import * as assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import {
  formatCommand,
  formatDuration,
  formatEnvValue,
  formatError,
  formatJson,
  formatOfficialMooncVersionCheckFailure,
  formatOfficialMooncVersionCheckLogs,
  logDiagnostic,
  logStep
} from '../diagnostics.js';
import {
  createOfficialMoonbitInstallEnv,
  createOfficialMoonbitInstallerCommand,
  type OfficialMoonbitInstallChannel,
  mooncPathForMoonHome
} from '../moonbit-toolchain.js';

const execFileAsync = promisify(execFile);

describe('MoonBit VS Code install command', function () {
  this.timeout(30 * 60 * 1000);

  it('installs moonc matching the same-channel official installer', async () => {
    const extensionId = requiredEnv('MOONBIT_EXTENSION_ID');
    const marketplaceVersion = requiredEnv('MOONBIT_MARKETPLACE_VERSION');
    const moonHome = requiredEnv('MOON_HOME');
    const officialMoonHome = requiredEnv('OFFICIAL_MOON_HOME');
    const marketplacePreRelease = parseBooleanEnv(requiredEnv('MOONBIT_MARKETPLACE_PRE_RELEASE'));
    const officialInstallChannel: OfficialMoonbitInstallChannel =
      marketplacePreRelease ? 'pre-release' : 'latest';

    logIntegrationSnapshot(
      extensionId,
      marketplaceVersion,
      marketplacePreRelease,
      moonHome,
      officialMoonHome
    );

    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, `${extensionId} should be installed in the isolated extensions directory`);
    logDiagnostic(`extension path: ${extension.extensionPath}`);
    logDiagnostic(`extension package version: ${String(extension.packageJSON.version)}`);
    assert.equal(
      String(extension.packageJSON.version),
      marketplaceVersion,
      `${extensionId} version should match the Marketplace version resolved by the runner`
    );

    const taskDiagnostics = installTaskDiagnostics();

    try {
      await logStep('activate Marketplace extension', () => extension.activate());

      const commands = await logStep('read VS Code command registry', () => vscode.commands.getCommands(true));
      logDiagnostic(`registered command count: ${commands.length}`);
      logDiagnostic(`moonbit.install-moonbit registered: ${String(commands.includes('moonbit.install-moonbit'))}`);
      assert.ok(
        commands.includes('moonbit.install-moonbit'),
        'moonbit.install-moonbit should be registered'
      );

      await logStep('execute moonbit.install-moonbit command', () =>
        vscode.commands.executeCommand('moonbit.install-moonbit', { silent: true })
      );

      const mooncPath = mooncPathForMoonHome(moonHome, process.platform);
      await waitForExecutable(mooncPath, 10 * 60 * 1000);

      const mooncVersionOutputValue = await mooncVersionOutput(mooncPath);
      const mooncVersion = extractVersion(mooncVersionOutputValue);
      logDiagnostic(`installed moonc version output: ${singleLine(mooncVersionOutputValue)}`);

      await logStep(`install MoonBit with official installer (${officialInstallChannel})`, () =>
        installOfficialMoonbit(officialMoonHome, officialInstallChannel)
      );

      const officialMooncPath = mooncPathForMoonHome(officialMoonHome, process.platform);
      await waitForExecutable(officialMooncPath, 10 * 60 * 1000);

      const officialMooncVersionOutputValue = await mooncVersionOutput(officialMooncPath);
      const officialMooncVersion = extractVersion(officialMooncVersionOutputValue);
      logDiagnostic(`official installer moonc path: ${officialMooncPath}`);
      logDiagnostic(`official installer moonc version output: ${singleLine(officialMooncVersionOutputValue)}`);
      logDiagnostic(
        `official version comparison extension-moonc=${mooncVersion} official-moonc=${officialMooncVersion}`
      );
      for (const message of formatOfficialMooncVersionCheckLogs(
        mooncVersion,
        officialMooncVersion,
        officialInstallChannel
      )) {
        logDiagnostic(message);
      }

      assert.equal(
        officialMooncVersion,
        mooncVersion,
        formatOfficialMooncVersionCheckFailure(
          mooncPath,
          officialMooncPath,
          officialInstallChannel,
          mooncVersion,
          officialMooncVersion
        )
      );
    } finally {
      for (const disposable of taskDiagnostics) {
        disposable.dispose();
      }
      logDiagnostic('disposed VS Code task diagnostics listeners');
    }
  });
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} should be set`);
  return value;
}

function parseBooleanEnv(value: string): boolean {
  assert.ok(value === 'true' || value === 'false', `expected boolean environment value, got: ${value}`);
  return value === 'true';
}

async function waitForExecutable(filePath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  let nextProgressAt = startedAt;
  let lastError: unknown;

  logDiagnostic(`waiting for executable ${filePath} for up to ${formatDuration(timeoutMs)}`);

  while (Date.now() < deadline) {
    try {
      await assertExecutable(filePath);
      logDiagnostic(`found executable ${filePath} after ${formatDuration(Date.now() - startedAt)}`);
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() >= nextProgressAt) {
        logDiagnostic(
          `still waiting for ${filePath} after ${formatDuration(Date.now() - startedAt)}: ${formatError(error)}`
        );
        nextProgressAt = Date.now() + 15_000;
      }
      await sleep(1000);
    }
  }

  logDiagnostic(`timed out waiting for ${filePath}: ${formatError(lastError)}`);
  throw new Error(`Timed out waiting for executable ${filePath}: ${String(lastError)}`);
}

async function assertExecutable(filePath: string): Promise<void> {
  const fileStat = await stat(filePath);
  assert.ok(fileStat.isFile(), `${filePath} should be a file`);

  if (process.platform !== 'win32') {
    await access(filePath, constants.X_OK);
  }
}

async function installOfficialMoonbit(
  moonHome: string,
  channel: OfficialMoonbitInstallChannel
): Promise<void> {
  await mkdir(moonHome, { recursive: true });

  const installer = createOfficialMoonbitInstallerCommand(process.platform, channel);
  const env = createOfficialMoonbitInstallEnv(process.env, moonHome, process.platform);

  logDiagnostic(`official MoonBit installer channel=${channel}`);
  logDiagnostic(`official MoonBit installer command: ${formatCommand(installer.command, installer.args)}`);
  logDiagnostic(`official MoonBit installer MOON_HOME=${moonHome}`);

  const result = await execFileAsync(installer.command, installer.args, {
    env,
    timeout: 10 * 60 * 1000,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });

  logDiagnostic(`official MoonBit installer stdout=${singleLine(result.stdout)}`);
  logDiagnostic(`official MoonBit installer stderr=${singleLine(result.stderr)}`);
}

async function mooncVersionOutput(mooncPath: string): Promise<string> {
  try {
    logDiagnostic(`running moonc version command: ${formatCommand(mooncPath, ['-v'])}`);
    const result = await execFileAsync(mooncPath, ['-v'], {
      env: process.env,
      timeout: 30_000,
      windowsHide: true
    });

    logDiagnostic(`moonc -v exit stdout=${singleLine(result.stdout)} stderr=${singleLine(result.stderr)}`);
    return `${result.stdout}\n${result.stderr}`;
  } catch (error) {
    logDiagnostic(`moonc -v failed, trying --version: ${formatError(error)}`);
    logDiagnostic(`running moonc version command: ${formatCommand(mooncPath, ['--version'])}`);
    const result = await execFileAsync(mooncPath, ['--version'], {
      env: process.env,
      timeout: 30_000,
      windowsHide: true
    });

    logDiagnostic(`moonc --version exit stdout=${singleLine(result.stdout)} stderr=${singleLine(result.stderr)}`);
    return `${result.stdout}\n${result.stderr}`;
  }
}

function extractVersion(value: string): string {
  const match = value.match(/\b(?:v)?(\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z]+)*)/);
  assert.ok(match, `could not extract a version from: ${value}`);
  return match[1];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logIntegrationSnapshot(
  extensionId: string,
  marketplaceVersion: string,
  marketplacePreRelease: boolean,
  moonHome: string,
  officialMoonHome: string
): void {
  logDiagnostic(`extension host platform=${process.platform} arch=${process.arch} node=${process.version}`);
  logDiagnostic(
    `workspace folders=${formatJson(vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [])}`
  );
  logDiagnostic(`target extension id=${extensionId}`);
  logDiagnostic(`marketplace version=${marketplaceVersion}`);
  logDiagnostic(`marketplace preRelease=${String(marketplacePreRelease)}`);
  logDiagnostic(`marketplace lastUpdated=${formatEnvValue(process.env.MOONBIT_MARKETPLACE_LAST_UPDATED)}`);
  logDiagnostic(`MOON_HOME=${moonHome}`);
  logDiagnostic(`OFFICIAL_MOON_HOME=${officialMoonHome}`);
  logDiagnostic(`HOME=${formatEnvValue(process.env.HOME)}`);
  logDiagnostic(`USERPROFILE=${formatEnvValue(process.env.USERPROFILE)}`);
  logDiagnostic(`PATH length=${process.env.PATH?.length ?? 0}`);
}

function installTaskDiagnostics(): vscode.Disposable[] {
  logDiagnostic('installing VS Code task diagnostics listeners');

  return [
    vscode.tasks.onDidStartTask((event) => {
      logDiagnostic(`task started: ${describeTaskExecution(event.execution)}`);
    }),
    vscode.tasks.onDidEndTask((event) => {
      logDiagnostic(`task ended: ${describeTaskExecution(event.execution)}`);
    }),
    vscode.tasks.onDidEndTaskProcess((event) => {
      logDiagnostic(
        `task process ended exitCode=${event.exitCode ?? '<undefined>'}: ${describeTaskExecution(event.execution)}`
      );
    })
  ];
}

function describeTaskExecution(execution: vscode.TaskExecution): string {
  const task = execution.task;

  return [
    `name=${task.name}`,
    `source=${task.source}`,
    `scope=${formatTaskScope(task.scope)}`,
    `definition=${formatJson(task.definition)}`,
    `execution=${describeTaskRun(task.execution)}`
  ].join(' ');
}

function describeTaskRun(
  execution: vscode.ProcessExecution | vscode.ShellExecution | vscode.CustomExecution | undefined
): string {
  if (execution === undefined) {
    return '<undefined>';
  }

  if (execution instanceof vscode.ShellExecution) {
    return describeShellExecution(execution);
  }

  if (execution instanceof vscode.ProcessExecution) {
    return `process command=${stringifyShellValue(execution.process)} args=${formatJson(execution.args ?? [])}`;
  }

  return execution.constructor.name;
}

function describeShellExecution(execution: vscode.ShellExecution): string {
  return [
    'shell',
    `commandLine=${formatEnvValue(execution.commandLine)}`,
    `command=${stringifyShellValue(execution.command)}`,
    `args=${formatJson((execution.args ?? []).map(stringifyShellValue))}`,
    `cwd=${formatEnvValue(execution.options?.cwd)}`
  ].join(' ');
}

function stringifyShellValue(value: string | vscode.ShellQuotedString | undefined): string {
  if (value === undefined) {
    return '<undefined>';
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.value;
}

function formatTaskScope(
  scope: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder | undefined
): string {
  if (scope === undefined) {
    return '<undefined>';
  }

  if (scope === vscode.TaskScope.Global) {
    return 'Global';
  }

  if (scope === vscode.TaskScope.Workspace) {
    return 'Workspace';
  }

  return `${scope.name}:${scope.uri.fsPath}`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
