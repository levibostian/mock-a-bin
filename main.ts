/**
 * Mock binary execution for testing purposes.
 * This is a Deno-native alternative to the npm package 'mock-bin'.
 *
 * Creates a mock executable in a temporary directory and prepends it to PATH,
 * allowing you to intercept and mock command-line tools during tests.
 *
 * ## Running the Original Command
 *
 * Your mock script can call the `mock-a-bin-run-original` binary to execute
 * the original command. This is useful when you want to mock specific
 * subcommands but pass through others to the real binary.
 *
 * @example
 * ```ts
 * const cleanup = await mockBin("gh", "bash", 'echo "mocked!!"')
 * // Now any calls to 'gh' will execute the mock script
 * // ... run your tests ...
 * cleanup() // Restore original PATH
 * ```
 *
 * @example
 * ```ts
 * // Mock only "gh pr list" but run real command for everything else
 * const cleanup = await mockBin("gh", "bash", `
 *   if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
 *     echo "mocked pr list"
 *   else
 *     mock-a-bin-run-original "$@"
 *   fi
 * `)
 * ```
 */

export interface MockBinCleanup {
  (): void
}

/**
 * Configuration for conditional mocking based on command patterns.
 */
export interface MockBinConfig {
  /** The name of the binary to mock (e.g., "gh", "git") */
  binName: string
  /** Optional regex pattern to match against the full command. If provided, only commands matching this pattern will be mocked. */
  pattern?: string
}

/**
 * Finds the path to a binary in the given PATH directories.
 *
 * @param binName - The name of the binary to find
 * @param pathDirs - Array of directories to search in
 * @returns The full path to the binary, or null if not found
 */
async function findBinaryInPath(binName: string, pathDirs: string[]): Promise<string | null> {
  for (const dir of pathDirs) {
    if (!dir) continue

    const binaryPath = `${dir}/${binName}`
    try {
      const fileInfo = await Deno.stat(binaryPath)
      if (fileInfo.isFile) {
        // Check if file is executable
        try {
          await Deno.permissions.query({ name: "run", command: binaryPath })
          return binaryPath
        } catch {
          // Not executable, continue searching
        }
      }
    } catch {
      // File doesn't exist, continue searching
    }
  }
  return null
}

/**
 * Creates a mock executable that will be used instead of the real binary.
 *
 * The mock script can call `mock-a-bin-run-original` to execute the original
 * command. This allows for conditional mocking where some subcommands are
 * mocked while others pass through to the real binary.
 *
 * @param binNameOrConfig - The name of the binary to mock (e.g., "gh", "git") or a configuration object with binName and optional pattern
 * @param shebang - The interpreter to use (e.g., "bash", "node", "python")
 * @param code - The script code to execute when the mock binary is called
 * @returns A cleanup function that restores the original PATH
 *
 * @example
 * ```ts
 * // Mock all commands
 * const cleanup = await mockBin("gh", "bash", 'echo "mocked"')
 *
 * // Mock only commands matching a pattern
 * const cleanup2 = await mockBin(
 *   { binName: "gh", pattern: "^gh pr (list|view)" },
 *   "bash",
 *   'echo "mocked pr command"'
 * )
 *
 * // Mock only specific subcommands using mock-a-bin-run-original
 * const cleanup3 = await mockBin("git", "bash", `
 *   if [ "$1" = "status" ]; then
 *     echo "mocked status"
 *   else
 *     mock-a-bin-run-original "$@"
 *   fi
 * `)
 * ```
 */
export async function mockBin(
  binNameOrConfig: string | MockBinConfig,
  shebang: string,
  code: string,
): Promise<MockBinCleanup> {
  // Parse the configuration
  const config = typeof binNameOrConfig === "string" ? { binName: binNameOrConfig } : binNameOrConfig
  const { binName, pattern } = config

  // Normalize the shebang
  const normalizedShebang = shebang.startsWith("#!") ? shebang : `#!/usr/bin/env ${shebang}`

  // Save the original PATH before we modify it
  const originalPath = Deno.env.get("PATH") || ""
  const pathSeparator = Deno.build.os === "windows" ? ";" : ":"

  // Create a temporary directory for the mock binary
  const tempDir = await Deno.makeTempDir({ prefix: "mock-bin-" })
  const mockScriptPath = `${tempDir}/${binName}`
  const userScriptPath = `${tempDir}/.${binName}-user-script`
  const runOriginalBinaryPath = `${tempDir}/mock-a-bin-run-original`

  // Create the 'mock-a-bin-run-original' helper binary
  // This binary can be called by the user's mock script to run the original command
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
`

  await Deno.writeTextFile(runOriginalBinaryPath, runOriginalScript)
  await Deno.chmod(runOriginalBinaryPath, 0o755)

  // If pattern is provided, create a wrapper that checks the pattern before running user code
  // Otherwise, just run the user's code directly
  let userScriptContent: string
  if (pattern) {
    // Find the real binary path (excluding our temp directory)
    const pathsWithoutTemp = originalPath.split(pathSeparator).filter((p) => p && !p.includes("mock-bin-"))
    const realBinaryPath = await findBinaryInPath(binName, pathsWithoutTemp)

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
  ${realBinaryPath ? `exec "${realBinaryPath}" "$@"` : `echo "Error: Real binary '${binName}' not found in PATH" >&2; exit 127`}
fi
`
  } else {
    // No pattern - just run the user's code (they can call mock-a-bin-run-original if needed)
    userScriptContent = `${normalizedShebang}\n${code}\n`
  }

  // Write the user's mock script to a separate file
  await Deno.writeTextFile(userScriptPath, userScriptContent)
  await Deno.chmod(userScriptPath, 0o755)

  // Create the main wrapper script that just runs the user's script
  // The user's script can call 'mock-a-bin-run-original' if it wants to delegate
  const wrapperScript = `#!/bin/bash
# Run the user's mock script with all arguments
exec "${userScriptPath}" "$@"
`

  await Deno.writeTextFile(mockScriptPath, wrapperScript)
  await Deno.chmod(mockScriptPath, 0o755)

  // Prepend the temp directory to PATH so our mock takes precedence
  Deno.env.set("PATH", `${tempDir}${pathSeparator}${originalPath}`)

  // Return a cleanup function that restores PATH and removes temp directory
  return () => {
    // Restore original PATH
    if (originalPath) {
      Deno.env.set("PATH", originalPath)
    } else {
      Deno.env.delete("PATH")
    }

    // Clean up the temporary directory
    try {
      Deno.removeSync(tempDir, { recursive: true })
    } catch (error) {
      // Ignore cleanup errors - temp dir will be cleaned up eventually
      console.warn(`Warning: Failed to remove mock-bin temp directory ${tempDir}: ${error}`)
    }
  }
}
