#!/usr/bin/env bun

/**
 * Proof 03: create with keychain-probe, read with security CLI.
 *
 * Goal: observe whether `/usr/bin/security find-generic-password -w` can read
 * a generic password created by the Swift `keychain-probe` binary.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-03.probe-create-security-read";
const label = "macos-keychain-analysis proof 03 probe create security read";
const cleanupOnly = Bun.argv.includes("--cleanup");
const observationPath = "observations/macos-26.5.1.md";
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";

type CommandResult = { command: string; exitCode: number; stdout: string; stderr: string };

async function runCommand(args: string[]): Promise<CommandResult> {
  const command = args.map(quoteShell).join(" ");
  console.log(`\n$ ${command}`);
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
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

function quoteShell(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[]) { return runCommand([probePath, ...args]); }
async function runSecurity(args: string[]) { return runCommand([securityPath, ...args]); }

async function printEnvironment() {
  const swVers = Bun.spawn(["/usr/bin/sw_vers"], { stdout: "pipe", stderr: "pipe" });
  const swVersOutput = await new Response(swVers.stdout).text();
  await swVers.exited;
  console.log("# Proof 03: keychain-probe create, security CLI read");
  console.log("\n## Environment");
  console.log(swVersOutput.trimEnd());
  console.log(`shell: ${process.env.SHELL ?? "unknown"}`);
  console.log(`bun: ${Bun.version}`);
  console.log(`creator: ${probePath}`);
  console.log(`reader: ${securityPath}`);
}

async function cleanup() {
  await runProbe(["delete", "--service", service, "--account", account]);
}

function parseSecurityPassword(stdout: string) { return stdout.trim(); }

async function main() {
  await printEnvironment();

  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("For each command, note whether macOS showed a Keychain prompt, the app name shown in the prompt, and whether you clicked Allow, Always Allow, Deny, or Cancel.");
  console.log(`Record observations in: ${observationPath}`);

  console.log("\n## Case: probe-create-security-read");
  console.log(`service: ${service}`);
  console.log("expected: keychain-probe creation should normally be silent. security CLI read may prompt because /usr/bin/security is not the creating trusted application.");

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Identify keychain-probe binary");
  await runProbe(["whoami"]);

  console.log("\n### Create disposable generic password via keychain-probe");
  await runProbe(["add", "--service", service, "--account", account, "--value", password, "--label", label]);

  console.log("\n### Inspect ACL list before security read");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n### Read password value via /usr/bin/security");
  const read = await runSecurity(["find-generic-password", "-a", account, "-s", service, "-w"]);
  console.log(`read matched expected disposable secret: ${parseSecurityPassword(read.stdout) === password ? "yes" : "no"}`);

  console.log("\n### Inspect item attributes via /usr/bin/security");
  await runSecurity(["find-generic-password", "-a", account, "-s", service]);

  console.log("\n### Inspect ACL list after security read");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:03:cleanup");
  console.log(`\n## Observation log\nRecord prompt observations in: ${observationPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
