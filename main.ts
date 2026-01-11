/**
 * Mock binary execution for testing purposes.
 * This is a Deno-native alternative to the npm package 'mock-bin'.
 *
 * Creates a mock executable in a temporary directory and prepends it to PATH,
 * allowing you to intercept and mock command-line tools during tests.
 *
 * @example
 * ```ts
 * const cleanup = await mockBin("gh", "bash", 'echo "mocked!!"')
 * // Now any calls to 'gh' will execute the mock script
 * // ... run your tests ...
 * cleanup() // Restore original PATH
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

  // Create a temporary directory for the mock binary
  const tempDir = await Deno.makeTempDir({ prefix: "mock-bin-" })
  const mockScriptPath = `${tempDir}/${binName}`

  // If pattern is provided, create a wrapper script that conditionally delegates to the real binary
  let scriptContent: string
  if (pattern) {
    // Find the real binary path (excluding our temp directory)
    const originalPath = Deno.env.get("PATH") || ""
    const pathSeparator = Deno.build.os === "windows" ? ";" : ":"
    const pathsWithoutTemp = originalPath.split(pathSeparator).filter((p) => p && !p.includes("mock-bin-"))
    const realBinaryPath = await findBinaryInPath(binName, pathsWithoutTemp)

    // Create a wrapper script that checks the pattern
    scriptContent = `${normalizedShebang}
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
    // No pattern - simple mock (backward compatible)
    scriptContent = `${normalizedShebang}\n${code}\n`
  }

  // Write the mock script
  await Deno.writeTextFile(mockScriptPath, scriptContent)

  // Make the script executable
  await Deno.chmod(mockScriptPath, 0o755)

  // Save the original PATH
  const originalPath = Deno.env.get("PATH") || ""

  // Prepend the temp directory to PATH so our mock takes precedence
  const pathSeparator = Deno.build.os === "windows" ? ";" : ":"
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
