import * as assert from 'node:assert/strict';
import { createInstallVsixSpawnConfig } from '../vscode-cli.js';

describe('VS Code CLI spawn configuration', () => {
  it('launches Windows cmd scripts through a shell', () => {
    const env = { ...process.env };
    const config = createInstallVsixSpawnConfig(
      'C:\\Program Files\\VS Code\\bin\\code.cmd',
      'C:\\Temp\\moonbit-latest.vsix',
      'C:\\Temp\\user data',
      'C:\\Temp\\extensions',
      env,
      'win32'
    );

    assert.equal(config.command, '"C:\\Program Files\\VS Code\\bin\\code.cmd"');
    assert.equal(config.options.shell, true);
    assert.equal(config.options.windowsHide, true);
    assert.equal(config.options.env, env);
    assert.deepEqual(config.args, [
      '--user-data-dir',
      'C:\\Temp\\user data',
      '--extensions-dir',
      'C:\\Temp\\extensions',
      '--install-extension',
      'C:\\Temp\\moonbit-latest.vsix',
      '--force'
    ]);
  });

  it('launches non-Windows CLIs directly', () => {
    const config = createInstallVsixSpawnConfig(
      '/tmp/vscode/bin/code',
      '/tmp/moonbit-latest.vsix',
      '/tmp/user-data',
      '/tmp/extensions',
      process.env,
      'linux'
    );

    assert.equal(config.command, '/tmp/vscode/bin/code');
    assert.equal(config.options.shell, false);
  });
});
