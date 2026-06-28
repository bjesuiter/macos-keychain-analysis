#!/usr/bin/env bun

/**
 * Proof 09: create with security CLI -T keychain-probe, then set keychain-probe cdhash partition.
 *
 * Goal: test whether `security add-generic-password -T keychain-probe` plus
 * `security set-generic-password-partition-list` can recreate the final ACL
 * state that Always Allow produced, making keychain-probe reads silent without
 * clicking Always Allow on the read prompt.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const service = "macos-keychain-analysis.proof-09.security-set-cdhash-partition";
const label = "macos-keychain-analysis proof 09 security set cdhash partition";
const cleanupOnly = Bun.argv.includes("--cleanup");
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
  if (stdout.trim()) console.log(stdout.trimEnd());
  if (stderr.trim()) console.error(stderr.trimEnd());
  console.log(`exit: ${exitCode}`);
  return { command, stdout, stderr, exitCode };
}

function quoteShell(value: string) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[]) { return runCommand([probePath, ...args]); }
async function runSecurity(args: string[]) { return runCommand([securityPath, ...args]); }

async function cleanup() {
  await runSecurity(["delete-generic-password", "-a", account, "-s", service]);
}

async function probeCdhash(): Promise<string> {
  const result = await runCommand(["/usr/bin/codesign", "-d", "-vvv", probePath]);
  const output = `${result.stdout}\n${result.stderr}`;
  const match = output.match(/CDHash=([0-9a-f]+)/i);
  if (!match) throw new Error(`Could not parse CDHash from codesign output:\n${output}`);
  return match[1].toLowerCase();
}

function parseJsonLine<T>(stdout: string): T | undefined {
  const line = stdout.trim().split("\n").find((candidate) => candidate.trim().startsWith("{"));
  if (!line) return undefined;
  return JSON.parse(line) as T;
}

async function readWithProbe(label: string) {
  console.log(`\n### ${label}`);
  const read = await runProbe(["read", "--service", service, "--account", account]);
  const parsed = parseJsonLine<{ ok: boolean; result?: { value?: string } }>(read.stdout);
  console.log(`read matched expected disposable secret: ${parsed?.result?.value === password ? "yes" : "no"}`);
}

async function main() {
  console.log("# Proof 09: security CLI -T plus set cdhash partition");

  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    await cleanup();
    return;
  }

  console.log("\n## What to record manually");
  console.log("Record whether add-generic-password, set-generic-password-partition-list, ACL reads, or later keychain-probe reads prompt.");
  console.log("If set-generic-password-partition-list asks for the login keychain password, enter it in the terminal/prompt as appropriate.");

  console.log("\n### Determine keychain-probe cdhash");
  const cdhash = await probeCdhash();
  const partitionList = `apple-tool:,cdhash:${cdhash}`;
  console.log(`keychain-probe CDHash: ${cdhash}`);
  console.log(`partition list to set: ${partitionList}`);

  console.log("\n### Setup: remove stale item");
  await cleanup();

  console.log("\n### Create item via /usr/bin/security with -T keychain-probe");
  await runSecurity(["add-generic-password", "-a", account, "-s", service, "-w", password, "-l", label, "-T", probePath]);

  console.log("\n### ACL list before setting partition list");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n### Set generic-password partition list to apple-tool + keychain-probe cdhash");
  await runSecurity(["set-generic-password-partition-list", "-a", account, "-s", service, "-S", partitionList]);

  console.log("\n### ACL list after setting partition list");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  await readWithProbe("First password read via keychain-probe");
  await readWithProbe("Second password read via keychain-probe");

  console.log("\n### ACL list after reads");
  await runProbe(["acl-list", "--service", service, "--account", account]);

  console.log("\n## Cleanup command");
  console.log("bun run proof:09:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
