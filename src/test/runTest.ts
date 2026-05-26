import {
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
  runTests
} from '@vscode/test-electron';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, freemem, platform, release, tmpdir, totalmem } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBytes, formatEnvValue, logDiagnostic, logSelectedEnv, logStep } from './diagnostics.js';
import { isMarketplacePreReleaseVersion, resolveOfficialMoonHome } from './moonbit-toolchain.js';
import { installVsix } from './vscode-cli.js';

const EXTENSION_ID = 'moonbit.moonbit-lang';
const MARKETPLACE_API =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1';
const currentDir = path.dirname(fileURLToPath(import.meta.url));

enum MarketplaceFlags {
  IncludeVersions = 0x1,
  IncludeFiles = 0x2,
  IncludeVersionProperties = 0x10,
  IncludeAssetUri = 0x80,
  IncludeLatestVersionOnly = 0x200
}

interface MarketplaceVersionFile {
  assetType: string;
  source?: string;
}

interface MarketplaceVersionProperty {
  key: string;
  value?: string;
}

interface MarketplaceVersion {
  version: string;
  lastUpdated?: string;
  files?: MarketplaceVersionFile[];
  properties?: MarketplaceVersionProperty[];
}

interface MarketplaceExtension {
  extensionName: string;
  publisher: {
    publisherName: string;
  };
  versions?: MarketplaceVersion[];
}

interface MarketplaceQueryResponse {
  results?: Array<{
    extensions?: MarketplaceExtension[];
  }>;
}

interface MarketplaceExtensionVersion {
  extension: MarketplaceExtension;
  version: MarketplaceVersion;
  vsixUrl: string;
}

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'moonbit-vscode-install-'));
  let completed = false;

  try {
    logRuntimeSnapshot(tempRoot);

    const workspacePath = path.join(tempRoot, 'workspace');
    const userDataDir = path.join(tempRoot, 'user-data');
    const extensionsDir = path.join(tempRoot, 'extensions');
    const homeDir = path.join(tempRoot, 'home');
    const moonHome = path.join(tempRoot, 'moon-home');
    const officialMoonHome = resolveOfficialMoonHome(moonHome);
    const vsixPath = path.join(tempRoot, 'moonbit-latest.vsix');

    logDiagnostic(`workspace path: ${workspacePath}`);
    logDiagnostic(`user data dir: ${userDataDir}`);
    logDiagnostic(`extensions dir: ${extensionsDir}`);
    logDiagnostic(`home dir: ${homeDir}`);
    logDiagnostic(`moon home: ${moonHome}`);
    logDiagnostic(`official installer moon home: ${officialMoonHome}`);

    await logStep('create isolated test environment', () =>
      createIsolatedEnvironment(workspacePath, userDataDir, extensionsDir, homeDir, moonHome, officialMoonHome)
    );

    const latest = await logStep(`resolve latest Marketplace version for ${EXTENSION_ID}`, () =>
      fetchLatestMarketplaceVersion(EXTENSION_ID)
    );
    const latestIsPreRelease = isMarketplacePreReleaseVersion(latest.version);
    logDiagnostic(
      `resolved ${EXTENSION_ID} version=${latest.version.version}` +
        ` lastUpdated=${formatEnvValue(latest.version.lastUpdated)}` +
        ` preRelease=${String(latestIsPreRelease)}` +
        ` vsixUrl=${latest.vsixUrl}`
    );

    await logStep('download Marketplace VSIX', () => downloadVsix(latest.vsixUrl, vsixPath));

    const vscodeExecutablePath = await logStep('download and unzip VS Code', () => downloadAndUnzipVSCode());
    logDiagnostic(`VS Code executable path: ${vscodeExecutablePath}`);
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);
    logDiagnostic(`VS Code CLI path: ${cliPath}`);
    const extensionHostEnv = createExtensionHostEnv(homeDir, moonHome);
    logExtensionHostEnv(extensionHostEnv);

    await logStep('install VSIX into isolated extensions directory', () => {
      installVsix(cliPath, vsixPath, userDataDir, extensionsDir, extensionHostEnv);
    });

    const extensionDevelopmentPath = path.resolve(currentDir, '../..');
    const extensionTestsPath = path.resolve(currentDir, './suite/index.js');
    const launchArgs = [
      workspacePath,
      '--user-data-dir',
      userDataDir,
      '--extensions-dir',
      extensionsDir,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes'
    ];
    logDiagnostic(`extension development path: ${extensionDevelopmentPath}`);
    logDiagnostic(`extension tests path: ${extensionTestsPath}`);
    logDiagnostic(`VS Code launch args: ${launchArgs.join(' ')}`);

    await logStep('run VS Code integration tests', () =>
      runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: {
          ...extensionHostEnv,
          MOONBIT_EXTENSION_ID: EXTENSION_ID,
          MOONBIT_MARKETPLACE_VERSION: latest.version.version,
          MOONBIT_MARKETPLACE_LAST_UPDATED: latest.version.lastUpdated ?? '',
          MOONBIT_MARKETPLACE_PRE_RELEASE: String(latestIsPreRelease),
          OFFICIAL_MOON_HOME: officialMoonHome
        },
        launchArgs
      })
    );

    completed = true;
  } finally {
    if (process.env.KEEP_MOONBIT_TEST_TEMP === '1') {
      console.error(`Preserving test temp directory: ${tempRoot}`);
    } else if (completed) {
      logDiagnostic(`cleaning up test temp directory: ${tempRoot}`);
      await rm(tempRoot, { recursive: true, force: true });
      logDiagnostic(`cleaned up test temp directory: ${tempRoot}`);
    } else {
      console.error(`Preserving test temp directory after failure: ${tempRoot}`);
    }
  }
}

async function createIsolatedEnvironment(
  workspacePath: string,
  userDataDir: string,
  extensionsDir: string,
  homeDir: string,
  moonHome: string,
  officialMoonHome: string
): Promise<void> {
  await mkdir(path.join(workspacePath, '.vscode'), { recursive: true });
  await mkdir(userDataDir, { recursive: true });
  await mkdir(extensionsDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(moonHome, { recursive: true });
  await mkdir(officialMoonHome, { recursive: true });

  await writeFile(
    path.join(workspacePath, '.vscode', 'settings.json'),
    `${JSON.stringify(
      {
        'moonbit.nodeLsp': true,
        'moonbit.autoUpdate': false
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function createExtensionHostEnv(homeDir: string, moonHome: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CACHE_HOME: path.join(homeDir, '.cache'),
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
    MOON_HOME: moonHome
  };
}

async function fetchLatestMarketplaceVersion(extensionId: string): Promise<MarketplaceExtensionVersion> {
  const response = await fetch(MARKETPLACE_API, {
    method: 'POST',
    headers: {
      Accept: 'application/json;api-version=7.2-preview.1',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filters: [
        {
          criteria: [
            {
              filterType: 7,
              value: extensionId
            }
          ],
          pageNumber: 1,
          pageSize: 1,
          sortBy: 0,
          sortOrder: 0
        }
      ],
      flags:
        MarketplaceFlags.IncludeVersions |
        MarketplaceFlags.IncludeFiles |
        MarketplaceFlags.IncludeVersionProperties |
        MarketplaceFlags.IncludeAssetUri |
        MarketplaceFlags.IncludeLatestVersionOnly
    })
  });

  if (!response.ok) {
    throw new Error(
      `Marketplace query failed with ${response.status} ${response.statusText}: ${await response.text()}`
    );
  }

  const body = (await response.json()) as MarketplaceQueryResponse;
  const extension = body.results?.[0]?.extensions?.[0];
  const version = extension?.versions?.[0];

  if (!extension || !version) {
    throw new Error(`Marketplace query returned no versions for ${extensionId}`);
  }

  const vsixUrl =
    version.files?.find((file) => file.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')
      ?.source ?? buildVsixDownloadUrl(extension, version);

  return {
    extension,
    version,
    vsixUrl
  };
}

function buildVsixDownloadUrl(extension: MarketplaceExtension, version: MarketplaceVersion): string {
  const publisher = encodeURIComponent(extension.publisher.publisherName);
  const extensionName = encodeURIComponent(extension.extensionName);
  const extensionVersion = encodeURIComponent(version.version);

  return `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${extensionVersion}/vspackage`;
}

async function downloadVsix(url: string, outputPath: string): Promise<void> {
  logDiagnostic(`downloading VSIX from ${url}`);
  logDiagnostic(`VSIX output path: ${outputPath}`);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream'
    }
  });

  const contentLength = response.headers.get('content-length');
  logDiagnostic(
    `VSIX response status=${response.status} ${response.statusText}` +
      ` content-type=${formatEnvValue(response.headers.get('content-type') ?? undefined)}` +
      ` content-length=${contentLength ? formatBytes(Number(contentLength)) : '<unset>'}`
  );

  if (!response.ok) {
    throw new Error(`VSIX download failed with ${response.status} ${response.statusText}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, body);
  logDiagnostic(`wrote VSIX ${outputPath} (${formatBytes(body.byteLength)})`);
}

function logRuntimeSnapshot(tempRoot: string): void {
  logDiagnostic(`runner platform=${platform()} arch=${arch()} release=${release()}`);
  logDiagnostic(`node=${process.version} execPath=${process.execPath}`);
  logDiagnostic(`cwd=${process.cwd()}`);
  logDiagnostic(`temp root=${tempRoot}`);
  logDiagnostic(
    `cpu count=${cpus().length} total memory=${formatBytes(totalmem())} free memory=${formatBytes(freemem())}`
  );
  logSelectedEnv([
    'CI',
    'GITHUB_ACTIONS',
    'GITHUB_RUN_ID',
    'GITHUB_JOB',
    'RUNNER_OS',
    'RUNNER_ARCH',
    'RUNNER_NAME'
  ]);
}

function logExtensionHostEnv(env: NodeJS.ProcessEnv): void {
  logDiagnostic(`extension host HOME=${formatEnvValue(env.HOME)}`);
  logDiagnostic(`extension host USERPROFILE=${formatEnvValue(env.USERPROFILE)}`);
  logDiagnostic(`extension host MOON_HOME=${formatEnvValue(env.MOON_HOME)}`);
  logDiagnostic(`extension host XDG_CACHE_HOME=${formatEnvValue(env.XDG_CACHE_HOME)}`);
  logDiagnostic(`extension host XDG_CONFIG_HOME=${formatEnvValue(env.XDG_CONFIG_HOME)}`);
  logDiagnostic(`extension host XDG_DATA_HOME=${formatEnvValue(env.XDG_DATA_HOME)}`);
  logDiagnostic(`extension host PATH length=${env.PATH?.length ?? 0}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
