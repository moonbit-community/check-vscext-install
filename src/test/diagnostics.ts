export type DiagnosticLog = (message: string) => void;

export interface LogStepOptions {
  now?: () => number;
  log?: DiagnosticLog;
}

const defaultLog: DiagnosticLog = (message) => {
  console.log(message);
};

const ansiGreen = '\u001b[32m';
const ansiReset = '\u001b[0m';

export function logDiagnostic(message: string, log: DiagnosticLog = defaultLog): void {
  log(`[diag] ${message}`);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s (${ms}ms)`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB (${bytes} B)`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MiB (${bytes} B)`;
}

export function formatEnvValue(value: string | undefined): string {
  if (value === undefined) {
    return '<unset>';
  }

  if (value === '') {
    return '<empty>';
  }

  return value;
}

export function formatCommand(command: string, args: readonly string[] = []): string {
  return [command, ...args].map(shellQuoteIfNeeded).join(' ');
}

export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(normalizeForJson(value)) ?? '<unserializable>';
  } catch {
    return '<unserializable>';
  }
}

export function formatMooncVersionCheckLogs(
  pluginRequestedVersion: string,
  downloadedVersion: string
): string[] {
  const successMessage = `moonc version check succeeded: ${downloadedVersion}`;
  const resultMessages =
    pluginRequestedVersion === downloadedVersion ? formatGreenBox(successMessage) : ['moonc version check failed'];

  return [
    `plugin requested moonc version: ${pluginRequestedVersion}`,
    `downloaded moonc version: ${downloadedVersion}`,
    ...resultMessages
  ];
}

export function formatMooncVersionCheckFailure(
  bundledLspPath: string,
  pluginRequestedVersion: string,
  downloadedVersion: string
): string {
  return (
    `installed moonc version should match the compiler version carried by ${bundledLspPath}; ` +
    `plugin requested moonc version=${pluginRequestedVersion}; ` +
    `downloaded moonc version=${downloadedVersion}`
  );
}

export function formatOfficialMooncVersionCheckLogs(
  extensionInstalledVersion: string,
  officialInstallerVersion: string,
  officialInstallerChannel: string
): string[] {
  const successMessage = `official installer moonc version check succeeded: ${officialInstallerVersion}`;
  const resultMessages =
    extensionInstalledVersion === officialInstallerVersion
      ? formatGreenBox(successMessage)
      : ['official installer moonc version check failed'];

  return [
    `VS Code extension-installed moonc version: ${extensionInstalledVersion}`,
    `official installer channel: ${officialInstallerChannel}`,
    `official installer moonc version: ${officialInstallerVersion}`,
    ...resultMessages
  ];
}

export function formatOfficialMooncVersionCheckFailure(
  extensionMooncPath: string,
  officialMooncPath: string,
  officialInstallerChannel: string,
  extensionInstalledVersion: string,
  officialInstallerVersion: string
): string {
  return (
    'VS Code extension-installed moonc version should match the official installer version; ' +
    `extension moonc path=${extensionMooncPath}; ` +
    `official moonc path=${officialMooncPath}; ` +
    `official installer channel=${officialInstallerChannel}; ` +
    `extension moonc version=${extensionInstalledVersion}; ` +
    `official installer moonc version=${officialInstallerVersion}`
  );
}

export async function logStep<T>(
  name: string,
  action: () => T | PromiseLike<T>,
  options: LogStepOptions = {}
): Promise<T> {
  const now = options.now ?? Date.now;
  const log = options.log ?? defaultLog;
  const startedAt = now();

  logDiagnostic(`>>> ${name}`, log);

  try {
    const result = await action();
    logDiagnostic(`<<< ${name} completed in ${formatDuration(now() - startedAt)}`, log);
    return result;
  } catch (error) {
    logDiagnostic(`xxx ${name} failed after ${formatDuration(now() - startedAt)}: ${formatError(error)}`, log);
    throw error;
  }
}

export function logSelectedEnv(names: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  for (const name of names) {
    logDiagnostic(`env ${name}=${formatEnvValue(env[name])}`);
  }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function formatGreenBox(message: string): string[] {
  const border = `+${'-'.repeat(message.length + 2)}+`;
  const spacer = `|${' '.repeat(message.length + 2)}|`;

  return [border, spacer, `| ${colorGreen(message)} |`, spacer, border];
}

function colorGreen(value: string): string {
  return `${ansiGreen}${value}${ansiReset}`;
}

function shellQuoteIfNeeded(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function normalizeForJson(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  return value;
}
