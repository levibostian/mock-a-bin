import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, expect, test } from "vitest";
import { mockBin } from "../main.js";

const runCommand = (
  command: string,
  args: string[] = [],
  env?: NodeJS.ProcessEnv,
): { stdout: string; stderr: string; code: number | null } => {
  const result = spawnSync(command, args, { encoding: "utf8", env });
  return {
    stdout: result.stdout as string,
    stderr: result.stderr as string,
    code: result.status,
  };
};

let savedPath: string | undefined;

beforeEach(() => {
  savedPath = process.env.PATH;
});

afterEach(() => {
  if (savedPath !== undefined) process.env.PATH = savedPath;
  else delete process.env.PATH;
});

test("mock and unmock git", async () => {
  const log = "mocking git!";
  const cleanup = await mockBin("git", "#!/usr/bin/env bash", `echo "${log}"`);

  const { stdout } = runCommand("git", ["status"]);

  expect(stdout).toBe(`${log}\n`);

  cleanup();
});

test("exit code", async () => {
  const cleanup = await mockBin("git", "#!/usr/bin/env bash", "exit 1");

  const { code } = runCommand("git");

  expect(code).toBe(1);
  cleanup();
});

test("environment shebang without #!", async () => {
  const log = "mocking git!";
  const cleanup = await mockBin("git", "bash", `echo "${log}"`);

  const { stdout } = runCommand("git");

  expect(stdout).toBe(`${log}\n`);
  cleanup();
});

test("mock command with arguments", async () => {
  const cleanup = await mockBin("gh", "bash", 'echo "pr: $1 $2"');

  const { stdout } = runCommand("gh", ["pr", "list"]);

  expect(stdout).toBe("pr: pr list\n");
  cleanup();
});

test("multiple mocks at once", async () => {
  const cleanup1 = await mockBin("git", "bash", 'echo "mocked git"');
  const cleanup2 = await mockBin("gh", "bash", 'echo "mocked gh"');

  const { stdout: gitStdout } = runCommand("git");
  expect(gitStdout).toBe("mocked git\n");

  const { stdout: ghStdout } = runCommand("gh");
  expect(ghStdout).toBe("mocked gh\n");

  cleanup1();
  cleanup2();
});

test("mock with node shebang", async () => {
  const cleanup = await mockBin(
    "testbin",
    "node",
    'console.log("Hello from Node")',
  );

  const { stdout } = runCommand("testbin");

  expect(stdout).toBe("Hello from Node\n");
  cleanup();
});

test("cleanup restores original PATH", async () => {
  const originalPath = process.env.PATH;
  const cleanup = await mockBin("git", "bash", 'echo "test"');

  // PATH should be modified
  const modifiedPath = process.env.PATH;
  expect(modifiedPath).not.toBe(originalPath);

  cleanup();

  // PATH should be restored
  const restoredPath = process.env.PATH;
  expect(restoredPath).toBe(originalPath);
});

test("cleanup handles missing temp directory gracefully", async () => {
  const cleanup = await mockBin("testbin", "bash", 'echo "test"');

  // Call cleanup twice - second call should handle missing directory
  cleanup();
  cleanup(); // Should not throw
});

test("mock with full shebang path", async () => {
  const cleanup = await mockBin(
    "testbin",
    "#!/bin/bash",
    'echo "full shebang"',
  );

  const { stdout } = runCommand("testbin");

  expect(stdout).toBe("full shebang\n");
  cleanup();
});

test("cleanup when original PATH was empty", async () => {
  // Save original PATH
  const originalPath = process.env.PATH;

  try {
    // Set PATH to empty
    delete process.env.PATH;

    const cleanup = await mockBin("testbin", "bash", 'echo "test"');

    // PATH should now have the temp directory
    const modifiedPath = process.env.PATH;
    expect(modifiedPath).not.toBeUndefined();

    cleanup();

    // PATH should be deleted again
    const restoredPath = process.env.PATH;
    expect(restoredPath).toBeUndefined();
  } finally {
    // Restore original PATH
    if (originalPath) process.env.PATH = originalPath;
  }
});

test("environment variables are passed through to original command", async () => {
  // Create a test script that uses mock-a-bin-run-original
  const cleanup = await mockBin(
    "env",
    "bash",
    `
    # Always pass through to real env command
    mock-a-bin-run-original "$@"
  `,
  );

  // Set a custom environment variable and run the command
  const { stdout, code } = runCommand("env", [], {
    ...process.env,
    CUSTOM_TEST_VAR: "my-custom-value",
    ANOTHER_VAR: "another-value",
  });

  // Should execute successfully
  expect(code).toBe(0);

  // Should contain our custom environment variables
  expect(stdout.includes("CUSTOM_TEST_VAR=my-custom-value")).toBe(true);
  expect(stdout.includes("ANOTHER_VAR=another-value")).toBe(true);

  cleanup();
});

test("mock-a-bin-run-original triggers original command execution", async () => {
  // Mock git to always call mock-a-bin-run-original, which should run the
  // real git
  const cleanup = await mockBin("git", "bash", 'mock-a-bin-run-original "$@"');

  const { stdout, code } = runCommand("git", ["--version"]);

  // Should have run the real git command
  expect(code).toBe(0);
  expect(stdout.includes("git version")).toBe(true);

  cleanup();
});

test("conditional mocking - mock specific subcommand, pass through others", async () => {
  const cleanup = await mockBin(
    "git",
    "bash",
    `
    if [ "$1" = "status" ]; then
      echo "mocked status output"
    else
      mock-a-bin-run-original "$@"
    fi
  `,
  );

  // Test the mocked subcommand
  const { stdout: statusStdout } = runCommand("git", ["status"]);
  expect(statusStdout).toBe("mocked status output\n");

  // Test that other subcommands pass through to real git
  const { stdout: versionStdout, code: versionCode } = runCommand("git", [
    "--version",
  ]);
  expect(versionCode).toBe(0);
  expect(versionStdout.includes("git version")).toBe(true);

  cleanup();
});

test("mock-a-bin-run-original with non-existent original binary shows error", async () => {
  const cleanup = await mockBin(
    "nonexistent-fake-binary-xyz",
    "bash",
    'mock-a-bin-run-original "$@"',
  );

  const { stderr, code } = runCommand("nonexistent-fake-binary-xyz");

  // Should exit with 127 (command not found) and show error message
  expect(code).toBe(127);
  expect(
    stderr.includes("Original 'nonexistent-fake-binary-xyz' command not found"),
  ).toBe(true);

  cleanup();
});

test("mock-a-bin-run-original works with node shebang", async () => {
  const cleanup = await mockBin(
    "git",
    "node",
    `
    const { spawnSync } = require('child_process')
    if (process.argv[2] === 'status') {
      console.log('mocked from node')
    } else {
      // Call mock-a-bin-run-original with all arguments
      const result = spawnSync('mock-a-bin-run-original', process.argv.slice(2), { stdio: 'inherit' })
      process.exit(result.status || 0)
    }
  `,
  );

  // Test mocked subcommand
  const { stdout: statusStdout } = runCommand("git", ["status"]);
  expect(statusStdout).toBe("mocked from node\n");

  // Test pass-through
  const { stdout: versionStdout, code } = runCommand("git", ["--version"]);
  expect(code).toBe(0);
  expect(versionStdout.includes("git version")).toBe(true);

  cleanup();
});

test("arguments are properly passed to original command via mock-a-bin-run-original", async () => {
  // Mock that only intercepts "branch" command
  const cleanup = await mockBin(
    "git",
    "bash",
    `
    if [ "$1" = "branch" ]; then
      echo "mocked branch"
    else
      mock-a-bin-run-original "$@"
    fi
  `,
  );

  // Run a command with multiple arguments - should pass through to real git
  const { code } = runCommand("git", ["log", "--oneline", "-n", "1"]);

  // Should execute successfully (assuming we're in a git repo)
  // If not in a git repo, it would fail with git's error, not our wrapper's
  expect(code === 0 || code === 128).toBe(true); // 128 is git's error code

  cleanup();
});

test("conditional mock: mock only matching commands with pattern", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "^git status" },
    "bash",
    'echo "mocked status"',
  );

  // Command matching pattern should be mocked
  const { stdout: statusStdout } = runCommand("git", ["status"]);
  expect(statusStdout).toBe("mocked status\n");

  // Command not matching pattern should use real git
  const { stdout: versionStdout } = runCommand("git", ["--version"]);
  expect(versionStdout.includes("git version")).toBe(true);

  cleanup();
});

test("conditional mock: pattern with multiple alternatives", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "^git (status|log)" },
    "bash",
    'echo "mocked: $*"',
  );

  // Both alternatives should be mocked
  const { stdout: statusStdout } = runCommand("git", ["status"]);
  expect(statusStdout).toBe("mocked: status\n");

  const { stdout: logStdout } = runCommand("git", ["log"]);
  expect(logStdout).toBe("mocked: log\n");

  // Non-matching command should use real binary
  const { stdout: versionStdout } = runCommand("git", ["--version"]);
  expect(versionStdout.includes("git version")).toBe(true);

  cleanup();
});

test("conditional mock: pattern with subcommand arguments", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "^git commit -m" },
    "bash",
    'echo "mocked commit"',
  );

  // Command with matching arguments should be mocked
  const { stdout: commitStdout } = runCommand("git", ["commit", "-m", "test"]);
  expect(commitStdout).toBe("mocked commit\n");

  // Different subcommand should use real git
  const { stdout: statusStdout } = runCommand("git", ["status"]);
  // Real git status might succeed or fail, but it shouldn't be mocked
  expect(statusStdout).not.toBe("mocked commit\n");

  cleanup();
});

test("conditional mock: backward compatibility without pattern", async () => {
  // Using string instead of config object should work as before
  const cleanup = await mockBin("git", "bash", 'echo "all mocked"');

  const { stdout: statusStdout } = runCommand("git", ["status"]);
  expect(statusStdout).toBe("all mocked\n");

  const { stdout: versionStdout } = runCommand("git", ["--version"]);
  expect(versionStdout).toBe("all mocked\n");

  cleanup();
});

test("conditional mock: empty pattern mocks everything", async () => {
  const cleanup = await mockBin(
    { binName: "git", pattern: "" },
    "bash",
    'echo "mocked with empty pattern"',
  );

  // All commands should be mocked (empty pattern matches everything)
  const { stdout: statusStdout } = runCommand("git", ["status"]);
  expect(statusStdout).toBe("mocked with empty pattern\n");

  cleanup();
});
