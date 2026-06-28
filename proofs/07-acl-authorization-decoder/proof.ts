#!/usr/bin/env bun

/**
 * Proof 07: compare ACL authorization tags across item creation shapes.
 *
 * This proof relies on keychain-probe acl-list including authorizations and
 * authorizationsRaw from SecACLCopyAuthorizations.
 */

const account = "macos-keychain-analysis";
const password = "disposable-proof-secret";
const packagePath = "packages/keychain-probe";
const probePath = "packages/keychain-probe/.build/arm64-apple-macosx/debug/keychain-probe";
const securityPath = "/usr/bin/security";
const cleanupOnly = Bun.argv.includes("--cleanup");

type Case = {
  name: string;
  service: string;
  label: string;
  create: () => Promise<void>;
};

async function runCommand(args: string[]) {
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
  return { stdout, stderr, exitCode };
}

function quoteShell(value: string) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function runProbe(args: string[]) { return runCommand([probePath, ...args]); }
async function runSecurity(args: string[]) { return runCommand([securityPath, ...args]); }
async function deleteItem(service: string) { await runSecurity(["delete-generic-password", "-a", account, "-s", service]); }

const cases: Case[] = [
  {
    name: "security-default",
    service: "macos-keychain-analysis.proof-07.security-default",
    label: "macos-keychain-analysis proof 07 security default",
    create: async function () {
      await runSecurity(["add-generic-password", "-a", account, "-s", this.service, "-w", password, "-l", this.label]);
    },
  },
  {
    name: "security-trust-probe",
    service: "macos-keychain-analysis.proof-07.security-trust-probe",
    label: "macos-keychain-analysis proof 07 security trust probe",
    create: async function () {
      await runSecurity(["add-generic-password", "-a", account, "-s", this.service, "-w", password, "-l", this.label, "-T", probePath]);
    },
  },
  {
    name: "probe-default",
    service: "macos-keychain-analysis.proof-07.probe-default",
    label: "macos-keychain-analysis proof 07 probe default",
    create: async function () {
      await runProbe(["add", "--service", this.service, "--account", account, "--value", password, "--label", this.label]);
    },
  },
];

async function main() {
  console.log("# Proof 07: ACL authorization decoder");
  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    for (const proofCase of cases) await deleteItem(proofCase.service);
    return;
  }

  console.log("\n## What to record manually");
  console.log("Record whether any acl-list command shows a GUI prompt. This proof is about ACL metadata, not secret reads.");

  for (const proofCase of cases) {
    console.log(`\n## Case: ${proofCase.name}`);
    console.log(`service: ${proofCase.service}`);
    console.log("\n### Setup: remove stale item");
    await deleteItem(proofCase.service);
    console.log("\n### Create item");
    await proofCase.create();
    console.log("\n### ACL list with authorization tags");
    await runProbe(["acl-list", "--service", proofCase.service, "--account", account]);
  }

  console.log("\n## Cleanup command");
  console.log("bun run proof:07:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
