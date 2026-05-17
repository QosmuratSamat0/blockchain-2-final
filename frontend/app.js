const CONFIG = window.DAPP_CONFIG;
const ZERO = "0x0000000000000000000000000000000000000000";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];
const GOVERNANCE_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function delegates(address) view returns (address)",
  "function getVotes(address) view returns (uint256)",
  "function delegate(address) returns (bool)"
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function reserve0() view returns (uint256)",
  "function reserve1() view returns (uint256)",
  "function swap(address,uint256,uint256,address) returns (uint256)"
];
const VAULT_ABI = [
  "function asset() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function deposit(uint256,address) returns (uint256)"
];
const LENDING_ABI = [
  "function collateralBalance(address) view returns (uint256)",
  "function debtOf(address) view returns (uint256)",
  "function healthFactor(address) view returns (uint256)"
];
const GOVERNOR_ABI = [
  "function state(uint256) view returns (uint8)",
  "function castVote(uint256,uint8) returns (uint256)"
];

const stateLabels = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed"
];

let provider;
let signer;
let account;

const $ = (id) => document.getElementById(id);

function status(message, isError = false) {
  const el = $("status");
  el.textContent = message;
  el.className = `status ${isError ? "error" : "ok"}`;
}

function friendlyError(error) {
  const text = error?.shortMessage || error?.reason || error?.message || "Transaction failed";
  if (text.includes("user rejected") || text.includes("User rejected"))
    return "Transaction rejected in wallet.";
  if (text.includes("insufficient funds")) return "Insufficient balance for this transaction.";
  if (text.includes("network")) return "Wrong network or RPC unavailable.";
  return text.replace(/^execution reverted: /, "");
}

function contract(address, abi, writable = false) {
  if (!address || address === ZERO) throw new Error("Contract address is not configured.");
  return new ethers.Contract(address, abi, writable ? signer : provider);
}

async function connect() {
  if (!window.ethereum) {
    status("MetaMask is not available in this browser.", true);
    return;
  }

  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  account = await signer.getAddress();
  $("connectButton").textContent = `${account.slice(0, 6)}...${account.slice(-4)}`;
  await ensureNetwork(false);
  await refresh();
}

async function ensureNetwork(requestSwitch) {
  const network = await provider.getNetwork();
  const expected = BigInt(CONFIG.expectedChainId);
  const wrong = network.chainId !== expected;

  $("switchNetworkButton").hidden = !wrong;
  $("networkLabel").textContent = wrong ? `Wrong network: ${network.chainId}` : CONFIG.chainName;

  if (wrong && requestSwitch) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${CONFIG.expectedChainId.toString(16)}` }]
    });
    await refresh();
  }
}

async function refresh() {
  if (!account) return;

  try {
    const token = contract(CONFIG.contracts.governanceToken, GOVERNANCE_TOKEN_ABI);
    const pair = contract(CONFIG.contracts.ammPair, PAIR_ABI);
    const vault = contract(CONFIG.contracts.yieldVault, VAULT_ABI);
    const lending = contract(CONFIG.contracts.lendingPool, LENDING_ABI);

    const [balance, votes, delegate, reserve0, reserve1, shares, collateral, debt, health] =
      await Promise.all([
        token.balanceOf(account),
        token.getVotes(account),
        token.delegates(account),
        pair.reserve0(),
        pair.reserve1(),
        vault.balanceOf(account),
        lending.collateralBalance(account),
        lending.debtOf(account),
        lending.healthFactor(account)
      ]);

    $("tokenBalance").textContent = ethers.formatEther(balance);
    $("votingPower").textContent = ethers.formatEther(votes);
    $("delegateAddress").textContent =
      delegate === ZERO ? "None" : `${delegate.slice(0, 6)}...${delegate.slice(-4)}`;
    $("poolReserves").textContent =
      `${ethers.formatEther(reserve0)} / ${ethers.formatEther(reserve1)}`;
    $("vaultShares").textContent = ethers.formatEther(shares);
    $("loanPosition").textContent =
      debt === 0n
        ? `${ethers.formatEther(collateral)} collateral, no debt`
        : `${ethers.formatEther(collateral)} collateral, ${ethers.formatEther(debt)} debt, HF ${ethers.formatEther(health)}`;

    await loadSubgraph();
  } catch (error) {
    status(friendlyError(error), true);
  }
}

async function swap() {
  try {
    await ensureNetwork(false);
    const pair = contract(CONFIG.contracts.ammPair, PAIR_ABI, true);
    const tokenIn = await pair.token0();
    const amount = ethers.parseEther($("swapAmount").value || "0");
    const minOut = ethers.parseEther($("minOut").value || "0");
    await contract(tokenIn, ERC20_ABI, true).approve(CONFIG.contracts.ammPair, amount);
    const tx = await pair.swap(tokenIn, amount, minOut, account);
    status(`Swap submitted: ${tx.hash}`);
    await tx.wait();
    status("Swap confirmed.");
    await refresh();
  } catch (error) {
    status(friendlyError(error), true);
  }
}

async function deposit() {
  try {
    await ensureNetwork(false);
    const vault = contract(CONFIG.contracts.yieldVault, VAULT_ABI, true);
    const asset = await vault.asset();
    const amount = ethers.parseEther($("depositAmount").value || "0");
    await contract(asset, ERC20_ABI, true).approve(CONFIG.contracts.yieldVault, amount);
    const tx = await vault.deposit(amount, account);
    status(`Deposit submitted: ${tx.hash}`);
    await tx.wait();
    status("Deposit confirmed.");
    await refresh();
  } catch (error) {
    status(friendlyError(error), true);
  }
}

async function vote(proposalId, support) {
  try {
    await ensureNetwork(false);
    const tx = await contract(CONFIG.contracts.governor, GOVERNOR_ABI, true).castVote(
      proposalId,
      support
    );
    status(`Vote submitted: ${tx.hash}`);
    await tx.wait();
    status("Vote confirmed.");
    await refresh();
  } catch (error) {
    status(friendlyError(error), true);
  }
}

async function loadSubgraph() {
  const proposalList = $("proposalList");
  const activityList = $("activityList");
  proposalList.innerHTML = "";
  activityList.innerHTML = "";

  if (!CONFIG.subgraphUrl || CONFIG.subgraphUrl.includes("YOUR_SUBGRAPH_ID")) {
    proposalList.textContent = "No indexed proposals configured.";
    activityList.textContent = "No indexed activity configured.";
    return;
  }

  const query = `{
    governanceProposals(first: 5, orderBy: createdAt, orderDirection: desc) {
      id
      description
      state
    }
    swaps(first: 8, orderBy: timestamp, orderDirection: desc) {
      id
      sender
      amountIn
      amountOut
    }
  }`;

  const response = await fetch(CONFIG.subgraphUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query })
  });
  const { data, errors } = await response.json();
  if (errors?.length) throw new Error(errors[0].message);

  for (const proposal of data.governanceProposals || []) {
    const row = document.createElement("button");
    row.className = "proposal-row";
    row.textContent = `${proposal.state}: ${proposal.description || proposal.id}`;
    row.addEventListener("click", () => {
      $("proposalId").value = proposal.id;
    });
    proposalList.appendChild(row);
  }

  for (const item of data.swaps || []) {
    const row = document.createElement("div");
    row.className = "activity-row";
    row.textContent = `${item.sender.slice(0, 6)} swapped ${ethers.formatEther(item.amountIn)} for ${ethers.formatEther(item.amountOut)}`;
    activityList.appendChild(row);
  }
}

$("connectButton").addEventListener("click", connect);
$("switchNetworkButton").addEventListener("click", () =>
  ensureNetwork(true).catch((error) => status(friendlyError(error), true))
);
$("swapButton").addEventListener("click", swap);
$("depositButton").addEventListener("click", deposit);
$("voteButton").addEventListener("click", () =>
  vote($("proposalId").value, Number($("support").value))
);

window.ethereum?.on("accountsChanged", () =>
  connect().catch((error) => status(friendlyError(error), true))
);
window.ethereum?.on("chainChanged", () => window.location.reload());
