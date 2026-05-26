import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { formatCommand, logDiagnostic } from './diagnostics.js';

export interface InstallVsixSpawnConfig {
  command: string;
  args: string[];
  options: SpawnSyncOptions;
}

export function createInstallVsixSpawnConfig(
  cliPath: string,
  vsixPath: string,
  userDataDir: string,
  extensionsDir: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): InstallVsixSpawnConfig {
  const useShell = platform === 'win32';

  return {
    command: useShell ? `"${cliPath}"` : cliPath,
    args: [
      '--user-data-dir',
      userDataDir,
      '--extensions-dir',
      extensionsDir,
      '--install-extension',
      vsixPath,
      '--force'
    ],
    options: {
      env,
      shell: useShell,
      stdio: 'inherit',
      windowsHide: true
    }
  };
}

export function installVsix(
  cliPath: string,
  vsixPath: string,
  userDataDir: string,
  extensionsDir: string,
  env: NodeJS.ProcessEnv
): void {
  logDiagnostic(`installing VSIX ${vsixPath} into isolated extensions directory ${extensionsDir}`);
  logDiagnostic(`VS Code CLI user data dir: ${userDataDir}`);

  const { command, args, options } = createInstallVsixSpawnConfig(
    cliPath,
    vsixPath,
    userDataDir,
    extensionsDir,
    env
  );
  logDiagnostic(`VS Code CLI install command: ${formatCommand(command, args)}`);
  logDiagnostic(`VS Code CLI spawn shell=${String(options.shell)} windowsHide=${String(options.windowsHide)}`);

  const result = spawnSync(command, args, options);
  logDiagnostic(
    `VS Code CLI install exited status=${result.status ?? '<null>'}` +
      ` signal=${result.signal ?? '<null>'}` +
      ` error=${result.error?.message ?? '<none>'}`
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`VS Code CLI extension install failed with exit code ${result.status ?? 'unknown'}`);
  }
}
