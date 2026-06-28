#!/usr/bin/env bun

/**
 * Proof 08: compare decoded Keychain partition lists across item creation shapes.
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
  afterCreate?: () => Promise<void>;
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
async function readProbe(service: string) { await runProbe(["read", "--service", service, "--account", account]); }

const cases: Case[] = [
  {
    name: "security-default",
    service: "macos-keychain-analysis.proof-08.security-default",
    label: "macos-keychain-analysis proof 08 security default",
    create: async function () { await runSecurity(["add-generic-password", "-a", account, "-s", this.service, "-w", password, "-l", this.label]); },
  },
  {
    name: "security-trust-probe",
    service: "macos-keychain-analysis.proof-08.security-trust-probe",
    label: "macos-keychain-analysis proof 08 security trust probe",
    create: async function () { await runSecurity(["add-generic-password", "-a", account, "-s", this.service, "-w", password, "-l", this.label, "-T", probePath]); },
  },
  {
    name: "probe-default",
    service: "macos-keychain-analysis.proof-08.probe-default",
    label: "macos-keychain-analysis proof 08 probe default",
    create: async function () { await runProbe(["add", "--service", this.service, "--account", account, "--value", password, "--label", this.label]); },
  },
  {
    name: "security-trust-probe-after-always-allow",
    service: "macos-keychain-analysis.proof-08.security-trust-probe-always-allow",
    label: "macos-keychain-analysis proof 08 security trust probe always allow",
    create: async function () { await runSecurity(["add-generic-password", "-a", account, "-s", this.service, "-w", password, "-l", this.label, "-T", probePath]); },
    afterCreate: async function () {
      console.log("\n### Trigger Always Allow manually on keychain-probe read");
      console.log("When prompted, choose Always Allow / Immer erlauben.");
      await readProbe(this.service);
    },
  },
];

async function main() {
  console.log("# Proof 08: partition-list decoder");
  console.log("\n## Build keychain-probe");
  await runCommand(["/usr/bin/swift", "build", "--package-path", packagePath]);

  if (cleanupOnly) {
    console.log("\n## Cleanup only");
    for (const proofCase of cases) await deleteItem(proofCase.service);
    return;
  }

  console.log("\n## What to record manually");
  console.log("Most cases should only acl-list. The always-allow case intentionally reads the secret; choose Always Allow if prompted.");

  for (const proofCase of cases) {
    console.log(`\n## Case: ${proofCase.name}`);
    await deleteItem(proofCase.service);
    await proofCase.create();
    console.log("\n### ACL list after create");
    await runProbe(["acl-list", "--service", proofCase.service, "--account", account]);
    if (proofCase.afterCreate) {
      await proofCase.afterCreate();
      console.log("\n### ACL list after manual step");
      await runProbe(["acl-list", "--service", proofCase.service, "--account", account]);
    }
  }

  console.log("\n## Cleanup command");
  console.log("bun run proof:08:cleanup");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
