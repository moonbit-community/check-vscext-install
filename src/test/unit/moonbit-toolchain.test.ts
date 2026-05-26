import * as assert from 'node:assert/strict';
import {
  createOfficialMoonbitInstallEnv,
  createOfficialMoonbitInstallerCommand,
  isMarketplacePreReleaseVersion,
  mooncPathForMoonHome,
  resolveOfficialMoonHome
} from '../moonbit-toolchain.js';

describe('MoonBit toolchain helpers', () => {
  it('uses the official Unix installer command on non-Windows platforms', () => {
    const command = createOfficialMoonbitInstallerCommand('linux');

    assert.equal(command.command, 'bash');
    assert.deepEqual(command.args, [
      '-lc',
      'curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash'
    ]);
  });

  it('passes the pre-release channel to the official Unix installer', () => {
    const command = createOfficialMoonbitInstallerCommand('linux', 'pre-release');

    assert.equal(command.command, 'bash');
    assert.deepEqual(command.args, [
      '-lc',
      "curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash -s 'pre-release'"
    ]);
  });

  it('uses the official PowerShell installer command on Windows', () => {
    const command = createOfficialMoonbitInstallerCommand('win32');

    assert.equal(command.command, 'powershell.exe');
    assert.deepEqual(command.args, [
      '-NoProfile',
      '-Command',
      'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; irm https://cli.moonbitlang.com/install/powershell.ps1 | iex'
    ]);
  });

  it('sets MOONBIT_INSTALL_VERSION before running the official Windows pre-release installer', () => {
    const command = createOfficialMoonbitInstallerCommand('win32', 'pre-release');

    assert.equal(command.command, 'powershell.exe');
    assert.deepEqual(command.args, [
      '-NoProfile',
      '-Command',
      "$env:MOONBIT_INSTALL_VERSION='pre-release'; Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; irm https://cli.moonbitlang.com/install/powershell.ps1 | iex"
    ]);
  });

  it('creates an isolated official installer environment with MOON_HOME first on PATH', () => {
    const env = createOfficialMoonbitInstallEnv(
      {
        PATH: '/usr/bin',
        MOON_HOME: '/tmp/extension-moon-home'
      },
      '/tmp/official-moon-home',
      'linux'
    );

    assert.equal(env.MOON_HOME, '/tmp/official-moon-home');
    assert.equal(env.PATH, '/tmp/official-moon-home/bin:/usr/bin');
  });

  it('preserves Windows PATH key casing when adding the official MOON_HOME bin directory', () => {
    const env = createOfficialMoonbitInstallEnv(
      {
        Path: 'C:\\Windows\\System32'
      },
      'C:\\Temp\\official-moon-home',
      'win32'
    );

    assert.equal(env.MOON_HOME, 'C:\\Temp\\official-moon-home');
    assert.equal(env.Path, 'C:\\Temp\\official-moon-home\\bin;C:\\Windows\\System32');
    assert.equal(env.PATH, undefined);
  });

  it('resolves platform-specific moonc paths and a sibling official MOON_HOME', () => {
    assert.equal(mooncPathForMoonHome('/tmp/moon-home', 'linux'), '/tmp/moon-home/bin/moonc');
    assert.equal(mooncPathForMoonHome('C:\\Temp\\moon-home', 'win32'), 'C:\\Temp\\moon-home\\bin\\moonc.exe');
    assert.equal(resolveOfficialMoonHome('/tmp/moon-home', 'linux'), '/tmp/official-moon-home');
  });

  it('detects Marketplace pre-release versions from VS Code extension properties', () => {
    assert.equal(
      isMarketplacePreReleaseVersion({
        properties: [
          {
            key: 'Microsoft.VisualStudio.Code.PreRelease',
            value: 'true'
          }
        ]
      }),
      true
    );

    assert.equal(
      isMarketplacePreReleaseVersion({
        properties: [
          {
            key: 'Microsoft.VisualStudio.Code.PreRelease',
            value: 'false'
          }
        ]
      }),
      false
    );

    assert.equal(isMarketplacePreReleaseVersion({ properties: [] }), false);
  });
});
