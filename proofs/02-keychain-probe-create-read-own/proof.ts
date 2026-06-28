#!/usr/bin/env bun

/**
 * Proof 02: keychain-probe creates and reads its own generic password.
 *
 * This proof uses the Swift `keychain-probe` binary in packages/keychain-probe.
 *
 * Goal: observe whether a generic password created via Security.framework by
 * keychain-probe can be read back by the same keychain-probe binary without a
 * Keychain prompt.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-02.keychain-probe-own";
const label = "macos-keychain-analysis proof 02 keychain-probe own";
const cleanupOnly = Bun.argv.includes("--cleanup");
const observationPath = "observations/macos-26.5.1.md";
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";

type CommandResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runCommand(args: string[]): Promise<CommandResult> {
  const command = args.map(quoteShell).join(" ");
  console.log(`\n$ ${command}`);

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (stdout.trim().length > 0) console.log(stdout.trimEnd());
  if (stderr.trim().length > 0) console.error(stderr.trimEnd());
  console.log(`exit: ${exitCode}`);

  return { command, exitCode, stdout, stderr };
}

async function runProbe(args: string[]): Promise<CommandResult> {
  return runCommand([probePath, ...args]);
}

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function cleanup(): Promise<void> {
  await runProbe(["delete", "--service", service, "--account", account]);
}

async function printEnvironment(): Promise<void> {
  const swVers = Bun.spawn(["/usr/bin/sw_vers"], { stdout: "pipe", stderr: "pipe" });
  const swVersOutput = await new Response(swVers.stdout).text();
  await swVers.exited;

  console.log("# Proof 02: keychain-probe create and read own generic password");
  console.log("\n## Environment");
  console.log(swVersOutput.trimEnd());
  console.log(`shell: ${process.env.SHELL ?? "unknown"}`);
  console.log(`bun: ${Bun.version}`);
  console.log(`tool: ${probePath}`);
}

async function buildProbe(): Promise<void> {
  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);
}

function parseJsonLine<T>(stdout: string): T | undefined {
  const line = stdout.trim().split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) return undefined;
  return JSON.parse(line) as T;
}

async function main(): Promise<void> {
  await printEnvironment();
  await buildProbe();

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("For each command, note whether macOS showed a Keychain prompt, the app name shown in the prompt, and whether you clicked Allow, Always Allow, Deny, or Cancel.");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n## Case: keychain-probe-own");
  console.log(`service: ${service}`);
  console.log("expected: Creation should normally be silent. Read may prompt or stay silent depending on the ACL macOS creates for this keychain-probe binary.");

  console.log("\n### Setup: remove any stale item");
  await cleanup();

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### Create disposable generic password via keychain-probe");
  await runProbe(["add", "--service", service, "--account", account, "--value", password, "--label", label]);

  console.log("\n### Read password value via keychain-probe");
  const read = await runProbe(["read", "--service", service, "--account", account]);
  const parsed = parseJsonLine<{ ok: boolean; result?: { value?: string } }>(read.stdout);
  console.log(`read matched expected disposable secret: ${parsed?.result?.value === password ? "yes" : "no"}`);

  console.log("\n### Inspect item metadata via keychain-probe");
  await runProbe(["metadata", "--service", service, "--account", account]);

  console.log("\n### Inspect ACL list via keychain-probe");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:02:cleanup");
  console.log(`\n## Observation log\nRecord prompt observations in: ${observationPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
