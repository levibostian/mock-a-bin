import { accessSync, constants, rmSync, statSync } from "node:fs";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface MockBinCleanup {
  (): void;
}

interface MockBinConfig {
  /** The name of the binary to mock (e.g., "gh", "git") */
  binName: string;
  /**
   * Optional regex pattern to match against the full command. If provided,
   * only commands matching this pattern will be mocked.
   */
  pattern?: string;
}

/**
 * Finds the path to a binary in the given PATH directories.
 *
 * @param binName - The name of the binary to find
 * @param pathDirs - Array of directories to search in
 * @returns The full path to the binary, or null if not found
 */
const findBinaryInPath = (
  binName: string,
  pathDirs: string[],
): string | null => {
  for (const dir of pathDirs) {
    if (!dir) continue;
    const binaryPath = join(dir, binName);
    try {
      const fileInfo = statSync(binaryPath);
      if (fileInfo.isFile())
        try {
          accessSync(binaryPath, constants.X_OK);
          return binaryPath;
        } catch {
          // Not executable, continue searching
        }
    } catch {
      // File doesn't exist, continue searching
    }
  }
  return null;
};

/**
 * Creates a mock executable that will be used instead of the real binary.
 *
 * The mock script can call `mock-a-bin-run-original` to execute the original
 * command. This allows for conditional mocking where some subcommands are
 * mocked while others pass through to the real binary.
 *
 * @param binNameOrConfig - The name of the binary to mock (e.g., "gh",
 *   "git") or a configuration object with binName and optional pattern
 * @param shebang - The interpreter to use (e.g., "bash", "node", "python")
 * @param code - The script code to execute when the mock binary is called
 * @returns A cleanup function that restores the original PATH
 */
const mockBin = async (
  binNameOrConfig: string | MockBinConfig,
  shebang: string,
  code: string,
): Promise<MockBinCleanup> => {
  // Parse the configuration
  const config =
    typeof binNameOrConfig === "string"
      ? { binName: binNameOrConfig }
      : binNameOrConfig;
  const { binName, pattern } = config;

  // Normalize the shebang
  const normalizedShebang = shebang.startsWith("#!")
    ? shebang
    : `#!/usr/bin/env ${shebang}`;

  // Save the original PATH before we modify it
  const originalPath = process.env.PATH ?? "";
  const pathSeparator = process.platform === "win32" ? ";" : ":";

  // Create a temporary directory for the mock binary
  const tempDir = await mkdtemp(join(tmpdir(), "mock-bin-"));
  const mockScriptPath = join(tempDir, binName);
  const userScriptPath = join(tempDir, `.${binName}-user-script`);
  const runOriginalBinaryPath = join(tempDir, "mock-a-bin-run-original");

  // Create the 'mock-a-bin-run-original' helper binary.
  // This binary can be called by the user's mock script to run the original
  // command.
  const runOriginalScript = `#!/bin/bash
# This binary finds and executes the original command
# It's called when the mock script decides to delegate to the real binary

# Restore original PATH to find the real binary
export PATH="${originalPath}"

# Find the original binary (excluding our temp directory)
ORIGINAL_BIN=$(command -v "${binName}" 2>/dev/null)

if [ -n "$ORIGINAL_BIN" ]; then
  # Execute the original binary with all arguments
  exec "$ORIGINAL_BIN" "$@"
else
  echo "Error: Original '${binName}' command not found in PATH" >&2
  exit 127
fi
`;

  await writeFile(runOriginalBinaryPath, runOriginalScript);
  await chmod(runOriginalBinaryPath, 0o755);

  let userScriptContent: string;
  if (pattern) {
    // Find the real binary path (excluding our temp directory)
    const pathsWithoutTemp = originalPath
      .split(pathSeparator)
      .filter((p) => p && !p.includes("mock-bin-"));
    const realBinaryPath = findBinaryInPath(binName, pathsWithoutTemp);

    // Create a wrapper script that checks the pattern first
    userScriptContent = `${normalizedShebang}
# Construct the full command with arguments
FULL_COMMAND="${binName} $*"

# Check if the command matches the pattern
if echo "$FULL_COMMAND" | grep -qE '${pattern}'; then
  # Pattern matches - execute mock code
${code}
else
  # Pattern doesn't match - execute the real binary
  ${
    realBinaryPath
      ? `exec "${realBinaryPath}" "$@"`
      : `echo "Error: Real binary '${binName}' not found in PATH" >&2; exit 127`
  }
fi
`;
  } else {
    // No pattern - just run the user's code (they can call
    // mock-a-bin-run-original if needed)
    userScriptContent = `${normalizedShebang}\n${code}\n`;
  }

  // Write the user's mock script to a separate file
  await writeFile(userScriptPath, userScriptContent);
  await chmod(userScriptPath, 0o755);

  // Create the main wrapper script that just runs the user's script.
  // The user's script can call 'mock-a-bin-run-original' if it wants to
  // delegate.
  const wrapperScript = `#!/bin/bash
# Run the user's mock script with all arguments
exec "${userScriptPath}" "$@"
`;

  await writeFile(mockScriptPath, wrapperScript);
  await chmod(mockScriptPath, 0o755);

  // Prepend the temp directory to PATH so our mock takes precedence
  process.env.PATH = `${tempDir}${pathSeparator}${originalPath}`;

  // Return a cleanup function that restores PATH and removes temp directory
  const cleanup = (): void => {
    // Restore original PATH
    if (originalPath) process.env.PATH = originalPath;
    else delete process.env.PATH;

    // Clean up the temporary directory
    try {
      rmSync(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors - temp dir will be cleaned up eventually
      console.warn(
        `Warning: Failed to remove mock-bin temp directory ${tempDir}: ${String(error)}`,
      );
    }
  };

  return cleanup;
};

export { type MockBinCleanup, type MockBinConfig, mockBin };
