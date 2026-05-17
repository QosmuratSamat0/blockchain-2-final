const { spawnSync } = require("child_process");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["hardhat", "test"], {
  env: { ...process.env, REPORT_GAS: "true" },
  shell: process.platform === "win32",
  stdio: "inherit"
});

process.exit(result.status ?? 1);
