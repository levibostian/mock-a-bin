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
 * Creates a mock executable that will be used instead of the real binary.
 *
 * @param binName - The name of the binary to mock (e.g., "gh", "git")
 * @param shebang - The interpreter to use (e.g., "bash", "node", "python")
 * @param code - The script code to execute when the mock binary is called
 * @returns A cleanup function that restores the original PATH
 */
export async function mockBin(
  binName: string,
  shebang: string,
  code: string,
): Promise<MockBinCleanup> {
  // Normalize the shebang
  const normalizedShebang = shebang.startsWith("#!") ? shebang : `#!/usr/bin/env ${shebang}`

  // Create a temporary directory for the mock binary
  const tempDir = await Deno.makeTempDir({ prefix: "mock-bin-" })
  const mockScriptPath = `${tempDir}/${binName}`

  // Write the mock script with shebang and code
  const scriptContent = `${normalizedShebang}\n${code}\n`
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
