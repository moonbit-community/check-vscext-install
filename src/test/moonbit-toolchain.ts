import * as path from 'node:path';

export interface OfficialMoonbitInstallerCommand {
  command: string;
  args: string[];
}

export type OfficialMoonbitInstallChannel = 'latest' | 'pre-release';

export interface MarketplaceVersionLike {
  properties?: Array<{
    key: string;
    value?: string;
  }>;
}

const preReleasePropertyKey = 'Microsoft.VisualStudio.Code.PreRelease';
const unixInstallerUrl = 'https://cli.moonbitlang.com/install/unix.sh';
const windowsInstallerUrl = 'https://cli.moonbitlang.com/install/powershell.ps1';

export function createOfficialMoonbitInstallerCommand(
  platform: NodeJS.Platform = process.platform,
  channel: OfficialMoonbitInstallChannel = 'latest'
): OfficialMoonbitInstallerCommand {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-Command', windowsInstallerScript(channel)]
    };
  }

  return {
    command: 'bash',
    args: ['-lc', unixInstallerScript(channel)]
  };
}

export function createOfficialMoonbitInstallEnv(
  baseEnv: NodeJS.ProcessEnv,
  moonHome: string,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    MOON_HOME: moonHome
  };
  const pathKey = pathEnvKey(env, platform);
  const existingPath = env[pathKey];
  const moonHomeBin = moonHomeBinDir(moonHome, platform);
  const delimiter = pathForPlatform(platform).delimiter;

  env[pathKey] = existingPath ? `${moonHomeBin}${delimiter}${existingPath}` : moonHomeBin;
  return env;
}

export function mooncPathForMoonHome(
  moonHome: string,
  platform: NodeJS.Platform = process.platform
): string {
  return pathForPlatform(platform).join(moonHome, 'bin', platform === 'win32' ? 'moonc.exe' : 'moonc');
}

export function resolveOfficialMoonHome(
  moonHome: string,
  platform: NodeJS.Platform = process.platform
): string {
  const platformPath = pathForPlatform(platform);

  return platformPath.join(platformPath.dirname(moonHome), 'official-moon-home');
}

export function isMarketplacePreReleaseVersion(version: MarketplaceVersionLike): boolean {
  return (
    version.properties?.some(
      (property) =>
        property.key === preReleasePropertyKey &&
        property.value?.toLowerCase() === 'true'
    ) ?? false
  );
}

function unixInstallerScript(channel: OfficialMoonbitInstallChannel): string {
  const command = `curl -fsSL ${unixInstallerUrl} | bash`;

  return channel === 'pre-release' ? `${command} -s 'pre-release'` : command;
}

function windowsInstallerScript(channel: OfficialMoonbitInstallChannel): string {
  const installCommand = `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; irm ${windowsInstallerUrl} | iex`;

  return channel === 'pre-release'
    ? `$env:MOONBIT_INSTALL_VERSION='pre-release'; ${installCommand}`
    : installCommand;
}

function moonHomeBinDir(moonHome: string, platform: NodeJS.Platform): string {
  return pathForPlatform(platform).join(moonHome, 'bin');
}

function pathForPlatform(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function pathEnvKey(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform !== 'win32') {
    return 'PATH';
  }

  return Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'Path';
}
