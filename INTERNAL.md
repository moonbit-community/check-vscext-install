# Internal Notes

## How installation success is determined

This project does not treat a successful CLI message as the final signal that installation worked. It verifies the Marketplace MoonBit VS Code extension and its install command in an isolated VS Code test environment.

The test runner in `src/test/runTest.ts` first creates temporary isolated directories for the workspace, VS Code user data, VS Code extensions, `HOME`/`USERPROFILE`, and `MOON_HOME`. It then resolves the latest `moonbit.moonbit-lang` version from the Visual Studio Marketplace, downloads that VSIX, downloads a test VS Code build, and installs the VSIX with the VS Code CLI:

```text
code --user-data-dir <temp-user-data> --extensions-dir <temp-extensions> --install-extension <moonbit-latest.vsix> --force
```

The first success gate is the VS Code CLI exit status. `installVsix` launches the CLI with `spawnSync` and an argument array, so Windows paths are passed without shell quoting rules. If the process exits with a non-zero status, `installVsix` throws `VS Code CLI extension install failed`, and the run fails before the extension-host tests start.

After that, `src/test/suite/moonbit-install.test.ts` runs inside the VS Code Extension Host and performs the real installation checks:

- `vscode.extensions.getExtension("moonbit.moonbit-lang")` must find the extension in the isolated extensions directory.
- The installed extension package version must equal the Marketplace version resolved by the runner.
- The extension must activate successfully.
- The command registry must include `moonbit.install-moonbit`.
- Executing `moonbit.install-moonbit` with `{ silent: true }` must create `MOON_HOME/bin/moonc` on Unix-like platforms or `MOON_HOME\bin\moonc.exe` on Windows within ten minutes.
- The created compiler binary must be a file. On non-Windows platforms it must also pass the POSIX executable-bit check; Windows skips that `X_OK` check because permission bits are not the relevant execution signal there.
- The installed compiler must run through `execFile`. The test first tries `-v`, then falls back to `--version`.
- The test then installs MoonBit again with the official CLI installer into a separate temporary `OFFICIAL_MOON_HOME`. Unix-like runners use `curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash`; Windows runners use the PowerShell installer from `https://cli.moonbitlang.com/install/powershell.ps1`. If the Marketplace latest version is marked as a VS Code pre-release version, Unix-like runners pass `pre-release` with `curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash -s 'pre-release'`, and Windows runners set `$env:MOONBIT_INSTALL_VERSION='pre-release'` before invoking the PowerShell installer. The official installer environment sets `MOON_HOME` to that separate directory and prepends its `bin` directory to `PATH`, which keeps the install isolated and avoids shell profile or user PATH mutation during the test.
- The compiler version installed by the VS Code extension must match the compiler version installed by the official CLI installer for the same channel.

The overall install check is successful only when `npm test` completes all of those steps without an assertion failure or thrown error.

The practical failure signals are therefore:

- The VS Code CLI cannot install the VSIX into the isolated extensions directory.
- The Marketplace extension is missing, has the wrong package version, fails activation, or does not register `moonbit.install-moonbit`.
- The extension command does not create the platform-specific compiler binary within ten minutes.
- The compiler binary is missing, is not a file, fails the non-Windows executable-bit check, or cannot be executed by `execFile`.
- The official CLI installer fails, does not create its isolated compiler binary, or installs a compiler version that differs from the VS Code extension-installed compiler.
