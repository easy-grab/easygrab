import QRCode from "qrcode";
import { PublicKey } from "@solana/web3.js";
import {
  decryptHistoryJson,
  deriveHistoryAccess,
  encryptHistoryJson,
  type EncryptedHistoryPayload,
  type HistoryAccess
} from "./crypto";
import {
  claimCoupon,
  claimCouponToAddress,
  connectWallet,
  couponBatchLamports,
  couponFromSecret,
  disconnectWallet,
  fundCoupons,
  generateCouponSecrets,
  getConnection,
  getDetectedWallets,
  getRpcBalance,
  getRpcBalances,
  getRpcLabel,
  getWalletBalance,
  lamportsToSol,
  MAX_COUPONS_PER_BATCH,
  parseClaimRoute,
  selectWalletProvider,
  signWalletMessage
} from "./solana";
import type { ClaimBatch, Cluster, Coupon } from "./types";
import "./styles.css";

const maybeAppRoot = document.querySelector<HTMLDivElement>("#app");

if (!maybeAppRoot) {
  throw new Error("Missing app root");
}

const appRoot = maybeAppRoot;

let cluster: Cluster = "mainnet-beta";
let walletAddress = "";
let coupons: Coupon[] = [];
let batches: ClaimBatch[] = [];
let activeBatchId = "";
let busy = false;
let lastFundSignature = "";
let networkMenuOpen = false;
let walletMenuOpen = false;
let walletModalOpen = false;
let batchAmountSol = "0.001";
let batchCount = 3;
let walletBalanceLabel = "";
let historyAccess: HistoryAccess | null = null;
let historyStatus = "Connect wallet";
let appNotice: Notice | null = null;

type EncryptedBatchRecord = {
  id: string;
  storageId: string;
  createdAt: string;
  updatedAt?: string;
  payload: EncryptedHistoryPayload;
};

type Notice = {
  tone: "success" | "error" | "info";
  title: string;
  body: string;
  href?: string;
  action?: string;
};

const BRAND_NAME = "Easy Grab";
const TICKER = "GRAB";
const EXAMPLE_CA = "So11111111111111111111111111111111111111112";
const OFFICIAL_X_URL = "https://x.com/easygrabfun";
const GITHUB_URL = "https://github.com/easy-grab/easygrab";
const API_BASE = import.meta.env.VITE_API_URL?.trim() || "http://127.0.0.1:8787";

const OFFICIAL_LINKS = {
  solanaDocs: "https://solana.com/docs",
  solanaJs: "https://solana.com/docs/clients/official/javascript",
  solanaWeb3Github: "https://github.com/solana-labs/solana-web3.js/",
  phantomDocs: "https://docs.phantom.com/introduction",
  phantomSignTransaction: "https://docs.phantom.com/phantom-deeplinks/provider-methods/signtransaction",
  solscan: "https://solscan.io/",
  mdnLocationHash: "https://developer.mozilla.org/en-US/docs/Web/API/Location/hash",
  mdnWebCrypto: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API",
  vite: "https://vite.dev/",
  qrcode: "https://www.npmjs.com/package/qrcode"
};

function setBusy(value: boolean) {
  busy = value;
  render();
}

function explorer(signature: string) {
  const suffix = cluster === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/tx/${signature}${suffix}`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function currentBatch() {
  return batches.find((batch) => batch.id === activeBatchId) ?? null;
}

function syncActiveBatchState(batch: ClaimBatch | null) {
  activeBatchId = batch?.id ?? "";
  coupons = batch?.coupons ?? [];
  lastFundSignature = batch?.fundSignature ?? "";

  if (batch?.coupons.length) {
    batchAmountSol = batch.coupons[0]?.amountSol ?? batchAmountSol;
    batchCount = batch.coupons.length;
  }
}

function replaceBatch(nextBatch: ClaimBatch) {
  const index = batches.findIndex((batch) => batch.id === nextBatch.id);
  if (index >= 0) {
    batches[index] = nextBatch;
  } else {
    batches.unshift(nextBatch);
  }

  batches = [...batches].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  syncActiveBatchState(nextBatch);
}

function formatUtc(iso: string) {
  return new Date(iso).toISOString().replace(".000Z", "Z");
}

function currentStep() {
  if (!walletAddress) return 1;
  if (!coupons.length) return 2;
  if (!lastFundSignature) return 3;
  return 4;
}

function stepClass(step: number) {
  const active = currentStep();
  if (step < active) return "is-complete";
  if (step === active) return "is-active";
  return "";
}

function primaryActionLabel() {
  if (!walletAddress) return "Connect wallet";
  if (!coupons.length) return "Generate claim links";
  if (!lastFundSignature) return "Fund this batch";
  return "Batch funded";
}

function primaryActionHelp() {
  if (!walletAddress) return "Connect the wallet that will fund this drop.";
  if (!coupons.length) return "Set the amount and quantity, then generate the claim links.";
  if (!lastFundSignature) return "Approve one transaction to fund the generated claim wallets.";
  return "Your links are funded and ready to copy, print, or export.";
}

function requiredFundingLabel() {
  if (!coupons.length) return "Set batch";
  return `${lamportsToSol(couponBatchLamports(coupons) + 10_000)} SOL`;
}

function historyMessage(address: string) {
  return [
    "Easy Grab encrypted history unlock",
    "Version: 1",
    `Network: ${cluster}`,
    `Wallet: ${address}`,
    "Only sign this message on the official Easy Grab app."
  ].join("\n");
}

async function unlockHistory(address: string) {
  if (historyAccess) return historyAccess;

  historyStatus = "Unlocking...";
  render();

  const signature = await signWalletMessage(historyMessage(address));
  historyAccess = await deriveHistoryAccess(signature);
  historyStatus = "Unlocked";
  return historyAccess;
}

async function encryptedRecordForBatch(batch: ClaimBatch) {
  if (!historyAccess) {
    throw new Error("Encrypted history is not unlocked.");
  }

  return {
    id: batch.id,
    storageId: historyAccess.storageId,
    createdAt: batch.createdAt,
    payload: await encryptHistoryJson(JSON.stringify(batch), historyAccess.key)
  };
}

async function saveBatchToServer(batch: ClaimBatch) {
  const record = await encryptedRecordForBatch(batch);
  const response = await fetch(`${API_BASE}/api/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    throw new Error(`History server rejected the batch (${response.status}).`);
  }
}

async function loadBatchesFromServer(address: string) {
  const access = await unlockHistory(address);
  const response = await fetch(`${API_BASE}/api/batches?storageId=${encodeURIComponent(access.storageId)}`);

  if (!response.ok) {
    throw new Error(`History server is unavailable (${response.status}).`);
  }

  const data = (await response.json()) as { records?: EncryptedBatchRecord[] };
  const nextBatches: ClaimBatch[] = [];

  for (const record of data.records ?? []) {
    try {
      const json = await decryptHistoryJson(record.payload, access.key);
      const batch = JSON.parse(json) as ClaimBatch;
      if (batch.cluster === cluster) {
        nextBatches.push(batch);
      }
    } catch {
      // Ignore records that cannot be decrypted by the connected wallet.
    }
  }

  batches = nextBatches.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  syncActiveBatchState(batches[0] ?? null);
}

async function refreshBatchStatus(batchId: string) {
  const batch = batches.find((item) => item.id === batchId);
  if (!batch) return;

  const connection = getConnection(cluster);
  const checkedAt = new Date().toISOString();
  const balances = await getRpcBalances(
    connection,
    batch.coupons.map((coupon) => new PublicKey(coupon.publicKey))
  );
  const updatedCoupons = batch.coupons.map((coupon, index) => ({
    ...coupon,
    balanceLamports: balances[index] ?? 0,
    checkedAt
  }));
  const nextBatch = { ...batch, coupons: updatedCoupons };

  replaceBatch(nextBatch);
  await saveBatchToServer(nextBatch);
}

function couponStatus(coupon: Coupon) {
  if (coupon.balanceLamports === undefined) return "Unchecked";
  if (coupon.balanceLamports <= 0) return "Claimed";
  return "Funded";
}

function isCouponClaimed(coupon: Coupon) {
  return coupon.balanceLamports !== undefined && coupon.balanceLamports <= 0;
}

function batchRemainingLamports(batch: ClaimBatch) {
  return batch.coupons.reduce((sum, coupon) => sum + (coupon.balanceLamports ?? 0), 0);
}

function batchClaimedCount(batch: ClaimBatch) {
  return batch.coupons.filter((coupon) => coupon.balanceLamports !== undefined && coupon.balanceLamports <= 0).length;
}

function walletBalanceDisplay(lamports: number) {
  const value = lamports / 1_000_000_000;
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  })} SOL`;
}

function fundingErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (cluster === "mainnet-beta" && (lowerMessage.includes("403") || lowerMessage.includes("access forbidden"))) {
    return `Mainnet RPC blocked this app request from ${getRpcLabel(
      cluster
    )}. The endpoint can be online and still reject browser balance and funding calls. Add VITE_MAINNET_RPC_URL, restart the app, then reconnect the wallet.`;
  }

  if (cluster === "devnet" && (lowerMessage.includes("insufficient") || lowerMessage.includes("simulate"))) {
    return `${message}\n\nEasy Grab checked the connected address on Devnet. If the wallet still shows an insufficient SOL warning, turn on Testnet Mode, choose Solana Devnet, then reconnect.`;
  }

  return message;
}

function isMainnetRpcBlocked(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return cluster === "mainnet-beta" && (lowerMessage.includes("403") || lowerMessage.includes("access forbidden"));
}

function balanceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (isMainnetRpcBlocked(error)) {
    return `Mainnet RPC rejected this browser request from ${getRpcLabel(
      cluster
    )}. The endpoint status can be normal while app traffic is still forbidden. Add a dedicated VITE_MAINNET_RPC_URL and restart the app.`;
  }

  return message;
}

function friendlyActionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("429") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("temporarily unavailable") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("failed to fetch")
  ) {
    return "Network is busy. Keep this page open and try again in a moment.";
  }

  return message;
}

function walletBalanceTone() {
  if (!walletAddress) return "";
  if (walletBalanceLabel === "Checking...") return "is-loading";
  if (walletBalanceLabel === "RPC blocked" || walletBalanceLabel === "Unavailable") return "is-warning";
  return "is-ready";
}

function setNotice(notice: Notice | null) {
  appNotice = notice;
}

function renderNotice() {
  if (!appNotice) return "";

  return `
    <div class="notice ${appNotice.tone}">
      <div>
        <strong>${escapeHtml(appNotice.title)}</strong>
        <p>${escapeHtml(appNotice.body)}</p>
      </div>
      ${
        appNotice.href
          ? `<a href="${escapeHtml(appNotice.href)}" target="_blank" rel="noreferrer">${escapeHtml(
              appNotice.action || "Open"
            )}</a>`
          : ""
      }
    </div>
  `;
}

async function connectAndTrackWallet() {
  const publicKey = await connectWallet();
  walletAddress = publicKey.toBase58();
  walletBalanceLabel = "Checking...";
  walletMenuOpen = false;
  render();

  try {
    const balance = await getWalletBalance(cluster, publicKey);
    walletBalanceLabel = walletBalanceDisplay(balance);
  } catch (error) {
    walletBalanceLabel = isMainnetRpcBlocked(error) ? "RPC blocked" : "Unavailable";
    if (!isMainnetRpcBlocked(error)) {
      setNotice({
        tone: "info",
        title: "Balance unavailable",
        body: balanceErrorMessage(error)
      });
    }
  }

  try {
    await loadBatchesFromServer(walletAddress);
    historyStatus = `${batches.length} batches`;
  } catch (error) {
    historyStatus = "Server unavailable";
    setNotice({
      tone: "error",
      title: "Encrypted history unavailable",
      body: error instanceof Error ? error.message : String(error)
    });
  }

  render();
  return publicKey;
}

async function refreshWalletBalance() {
  if (!walletAddress) {
    walletBalanceLabel = "";
    return;
  }

  walletBalanceLabel = "Checking...";
  render();

  try {
    const balance = await getWalletBalance(cluster, new PublicKey(walletAddress));
    walletBalanceLabel = walletBalanceDisplay(balance);
  } catch (error) {
    walletBalanceLabel = isMainnetRpcBlocked(error) ? "RPC blocked" : "Unavailable";
    if (!isMainnetRpcBlocked(error)) {
      setNotice({
        tone: "info",
        title: "Balance unavailable",
        body: balanceErrorMessage(error)
      });
    }
  }

  render();
}

function normalizedPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function homePath() {
  return normalizedPath().replace(/\/architecture$/, "") || "/";
}

function architecturePath() {
  return `${homePath().replace(/\/$/, "")}/architecture`;
}

function isArchitectureRoute() {
  return normalizedPath().endsWith("/architecture");
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

async function downloadQrPng(filename: string, url: string) {
  const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2 });
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

async function renderQrCodes() {
  const targets = document.querySelectorAll<HTMLCanvasElement>("[data-qr]");
  for (const canvas of targets) {
    const url = canvas.dataset.qr;
    if (url) {
      await QRCode.toCanvas(canvas, url, { width: 136, margin: 1 });
    }
  }
}

function scrollToElement(id: string) {
  requestAnimationFrame(() => {
    const element = document.getElementById(id);
    if (!element) return;
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const offset = (topbar?.offsetHeight ?? 0) + 24;
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  });
}

function navigateHome(scrollTarget?: string) {
  window.history.pushState({}, "", homePath());
  renderCreate();
  if (scrollTarget) {
    scrollToElement(scrollTarget);
  } else {
    scrollToPageTop();
  }
}

function navigateArchitecture() {
  window.history.pushState({}, "", architecturePath());
  renderArchitecturePage();
  scrollToPageTop();
}

function renderWalletModal() {
  if (!walletModalOpen) return "";

  const wallets = getDetectedWallets();
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
        <button id="wallet-modal-close" class="modal-close" aria-label="Close wallet selection">Close</button>
        <div class="modal-brand" aria-hidden="true">
          <img src="/grab-mark.svg" alt="" />
        </div>
        <h2 id="wallet-modal-title">Welcome to ${BRAND_NAME}.</h2>
        <div class="modal-divider" aria-hidden="true"></div>
        <div class="wallet-choice-list">
          ${wallets
            .map(
              (wallet) => `
                <button data-wallet="${wallet.id}" class="wallet-choice" ${busy ? "disabled" : ""}>
                  <span>${wallet.name}</span>
                  <em>${wallet.installed ? "Detected" : "Install"}</em>
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderShell(content: string) {
  appRoot.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand-lockup">
          <div class="brand-mark" aria-hidden="true">
            <img src="/grab-mark.svg" alt="" />
          </div>
          <div>
            <div class="mark">${BRAND_NAME}</div>
          </div>
        </div>
        <div class="top-actions">
          <nav class="main-nav" aria-label="Main navigation">
            <button id="copy-ca-nav" class="nav-ca"><span>CA</span><strong>${shortAddress(EXAMPLE_CA)}</strong></button>
            <button id="nav-app" class="nav-link">App</button>
            <button id="nav-architecture" class="nav-link">Architecture</button>
            <a href="${OFFICIAL_X_URL}" target="_blank" rel="noreferrer">X</a>
            <a href="${GITHUB_URL}" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <div class="network">
            <div class="network-picker">
              <button id="network-toggle" class="network-toggle" aria-haspopup="listbox" aria-expanded="${networkMenuOpen}">
                ${cluster === "devnet" ? "Devnet" : "Mainnet"}
              </button>
              <div class="network-menu ${networkMenuOpen ? "is-open" : ""}" role="listbox">
                <button data-network="devnet" class="${cluster === "devnet" ? "is-selected" : ""}" role="option">Devnet</button>
                <button data-network="mainnet-beta" class="${cluster === "mainnet-beta" ? "is-selected" : ""}" role="option">Mainnet</button>
              </div>
            </div>
            <div class="wallet-panel ${walletAddress ? "is-connected" : ""}">
              <button id="connect" class="wallet-button" aria-haspopup="${walletAddress ? "menu" : "false"}" aria-expanded="${walletMenuOpen}">
                ${walletAddress ? shortAddress(walletAddress) : "Connect wallet"}
              </button>
              ${
                walletAddress
                  ? `<div class="wallet-balance-card ${walletBalanceTone()}">
                      <span>${cluster === "devnet" ? "Devnet" : "Mainnet"}</span>
                      <strong>${walletBalanceLabel || "Checking..."}</strong>
                    </div>
                    <div class="wallet-menu ${walletMenuOpen ? "is-open" : ""}" role="menu">
                      <button id="disconnect-wallet" role="menuitem">Disconnect</button>
                    </div>`
                  : ""
              }
            </div>
          </div>
        </div>
      </header>
      ${content}
    </div>
    ${renderWalletModal()}
  `;

  document.querySelector<HTMLButtonElement>("#network-toggle")?.addEventListener("click", () => {
    networkMenuOpen = !networkMenuOpen;
    render();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-network]").forEach((button) => {
    button.addEventListener("click", () => {
      cluster = button.dataset.network as Cluster;
      networkMenuOpen = false;
      walletMenuOpen = false;
      appNotice = null;
      historyAccess = null;
      historyStatus = walletAddress ? "Unlock required" : "Connect wallet";
      batches = [];
      activeBatchId = "";
      coupons = [];
      lastFundSignature = "";
      walletBalanceLabel = walletAddress ? "Checking..." : "";
      render();
      void refreshWalletBalance();
      if (walletAddress) {
        void loadBatchesFromServer(walletAddress)
          .then(() => {
            historyStatus = `${batches.length} batches`;
            render();
          })
          .catch((error) => {
            historyStatus = "Server unavailable";
            setNotice({
              tone: "error",
              title: "Encrypted history unavailable",
              body: error instanceof Error ? error.message : String(error)
            });
            render();
          });
      }
    });
  });

  document.querySelector<HTMLButtonElement>("#connect")?.addEventListener("click", async () => {
    if (walletAddress) {
      walletMenuOpen = !walletMenuOpen;
      networkMenuOpen = false;
      render();
      return;
    }

    walletModalOpen = true;
    render();
  });

  document.querySelector<HTMLButtonElement>("#nav-app")?.addEventListener("click", () => {
    navigateHome("create");
  });

  document.querySelector<HTMLButtonElement>("#nav-architecture")?.addEventListener("click", () => {
    navigateArchitecture();
  });

  document.querySelector<HTMLButtonElement>("#copy-ca-nav")?.addEventListener("click", async (event) => {
    await copy(EXAMPLE_CA);
    const button = event.currentTarget as HTMLButtonElement;
    const label = button.querySelector("span");
    if (!label) return;
    label.textContent = "Copied";
    setTimeout(() => (label.textContent = "CA"), 900);
  });

  document.querySelector<HTMLButtonElement>("#wallet-modal-close")?.addEventListener("click", () => {
    walletModalOpen = false;
    render();
  });

  document.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      walletModalOpen = false;
      render();
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-wallet]").forEach((button) => {
    button.addEventListener("click", async () => {
      const walletId = button.dataset.wallet as "phantom" | "solflare" | "coinbase";
      const wallet = getDetectedWallets().find((item) => item.id === walletId);

      if (!wallet?.installed) {
        window.open(wallet?.installUrl ?? "https://solana.com/ecosystem/explore?categories=wallet", "_blank", "noopener,noreferrer");
        return;
      }

      try {
        setBusy(true);
        selectWalletProvider(walletId);
        walletModalOpen = false;
        await connectAndTrackWallet();
      } catch (error) {
        setNotice({
          tone: "error",
          title: "Wallet connection failed",
          body: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setBusy(false);
      }
    });
  });

  document.querySelector<HTMLButtonElement>("#disconnect-wallet")?.addEventListener("click", () => {
    void disconnectWallet();
    walletAddress = "";
    walletBalanceLabel = "";
    historyAccess = null;
    historyStatus = "Connect wallet";
    batches = [];
    activeBatchId = "";
    coupons = [];
    lastFundSignature = "";
    walletMenuOpen = false;
    appNotice = null;
    render();
  });
}

function renderCreate() {
  const activeBatch = currentBatch();

  renderShell(`
    <section class="hero-band">
      <div class="hero-copy">
        <div class="eyebrow">Claim links for Solana rewards</div>
        <h1><span>Grab SOL</span> in one click.</h1>
        <p>${BRAND_NAME} creates funded claim links for QR drops, event rewards, private payouts, and launch campaigns. Recipients can claim with a wallet or receive to a pasted Solana address.</p>
        <div class="hero-actions">
          <button id="hero-open-app" class="primary-link">Open app</button>
          <button id="hero-read-architecture" class="secondary-link">Read architecture</button>
        </div>
        <div class="hero-footnote">
          <span>Generate links</span>
          <span>Fund rewards</span>
          <span>Share QR codes</span>
          <span>Claim to wallet</span>
        </div>
      </div>
      <div class="product-visual" aria-label="${BRAND_NAME} claim preview">
        <div class="ticket-top">
          <span>${BRAND_NAME} link</span>
          <strong>Preview</strong>
        </div>
        <div class="claim-preview-card">
          <strong>Choose how to receive</strong>
          <div class="preview-option primary">Claim with wallet</div>
          <div class="preview-address">
            <span>Recipient address</span>
            <em>Paste Solana address</em>
          </div>
          <div class="preview-option">Send to address</div>
        </div>
        <div class="ticket-bottom">
          <span>One link</span>
          <span>Wallet optional</span>
        </div>
      </div>
    </section>

    <section class="status-strip">
      <button id="copy-ca-hero" class="status-ca-rail">
        <span>Contract Address</span>
        <strong>${EXAMPLE_CA}</strong>
        <em>Copy</em>
      </button>
      <a class="status-link" href="${OFFICIAL_X_URL}" target="_blank" rel="noreferrer"><span>Official X</span><strong>@easygrabfun</strong></a>
      <a class="status-link" href="${GITHUB_URL}" target="_blank" rel="noreferrer"><span>Source code</span><strong>GitHub public repo</strong></a>
    </section>

    <section class="format-band" id="use-cases">
      <div class="section-head">
        <span>Use</span>
        <h2>One primitive, several distribution formats.</h2>
      </div>
      <div class="format-grid">
        <article><strong>QR drops</strong><p>Print one funded link per reward and distribute it anywhere.</p></article>
        <article><strong>Private links</strong><p>Send a claim to a recipient before you know their wallet address.</p></article>
        <article><strong>Campaign batches</strong><p>Create many small rewards from one screen and fund them together.</p></article>
      </div>
    </section>

    <section class="app-frame" id="create">
      <div class="app-frame-top">
        <div>
          <span></span><span></span><span></span>
        </div>
        <strong>${BRAND_NAME} Console</strong>
        <em>${cluster}</em>
      </div>
      <div class="workspace">
      <div class="creator-panel">
        <div class="section-head">
          <span>Creator console</span>
          <h2>Batch builder</h2>
          <p>${primaryActionHelp()}</p>
        </div>
        <div class="step-row" aria-label="Batch creation steps">
          <div class="${stepClass(1)}"><span>1</span><strong>Wallet</strong></div>
          <div class="${stepClass(2)}"><span>2</span><strong>Batch</strong></div>
          <div class="${stepClass(3)}"><span>3</span><strong>Fund</strong></div>
          <div class="${stepClass(4)}"><span>4</span><strong>Share</strong></div>
        </div>
        <div class="input-grid">
          <label>
            SOL per claim
            <input id="amount" inputmode="decimal" value="${escapeHtml(batchAmountSol)}" ${busy || !walletAddress || coupons.length > 0 ? "disabled" : ""} />
          </label>
          <label>
            Claims in batch
            <input id="count" type="number" min="1" max="${MAX_COUPONS_PER_BATCH}" value="${batchCount}" ${busy || !walletAddress || coupons.length > 0 ? "disabled" : ""} />
          </label>
        </div>
        <div class="actions">
          <button id="primary-flow" class="primary-button" ${busy || currentStep() === 4 ? "disabled" : ""}>${primaryActionLabel()}</button>
          <button id="reset" class="ghost-button" ${busy || coupons.length === 0 ? "disabled" : ""}>New batch</button>
        </div>
        ${renderNotice()}
      </div>

      <aside class="operator-card">
        <span>Batch preview</span>
        <div class="mini-ledger">
          <div><span>Network</span><strong>${cluster === "devnet" ? "Devnet" : "Mainnet"}</strong></div>
          <div><span>Wallet</span><strong>${walletAddress ? shortAddress(walletAddress) : "Not connected"}</strong></div>
          <div><span>Needed</span><strong>${requiredFundingLabel()}</strong></div>
          <div><span>History</span><strong>${escapeHtml(historyStatus)}</strong></div>
          <div><span>Status</span><strong>${lastFundSignature ? "Funded" : coupons.length ? "Generated" : "Ready"}</strong></div>
        </div>
        <p>For public drops, print one QR per reward. For personal rewards, share one link with one recipient.</p>
      </aside>
      </div>
    </section>

    ${activeBatch ? renderCoupons(activeBatch) : renderEmptyState()}
    ${renderBatchHistory()}

    <section class="proof-band" id="architecture">
      <div class="section-head">
        <span>Architecture</span>
        <h2>Simple rails, visible movement.</h2>
      </div>
      <div class="proof-grid">
        <article><strong>Temporary wallets</strong><p>Each reward has its own funded Solana wallet.</p></article>
        <article><strong>Two claim modes</strong><p>Recipients can connect a wallet or paste a Solana address.</p></article>
        <article><strong>Local generation</strong><p>Links are created in the browser before funding.</p></article>
        <article><strong>Public repo</strong><p>Build checks, release hashes, and threat docs stay visible.</p></article>
      </div>
    </section>
  `);

  document.querySelector<HTMLButtonElement>("#copy-ca-hero")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    await copy(EXAMPLE_CA);
    const label = button.querySelector("em");
    if (!label) return;
    label.textContent = "Copied";
    setTimeout(() => (label.textContent = "Copy"), 900);
  });

  document.querySelector<HTMLButtonElement>("#hero-open-app")?.addEventListener("click", () => {
    scrollToElement("create");
  });

  document.querySelector<HTMLButtonElement>("#hero-read-architecture")?.addEventListener("click", () => {
    navigateArchitecture();
  });

  document.querySelector<HTMLButtonElement>("#primary-flow")?.addEventListener("click", async () => {
    if (!walletAddress) {
      walletModalOpen = true;
      render();
      return;
    }

    if (!coupons.length) {
      await generateBatchFromInputs();
      return;
    }

    await fundCurrentBatch();
  });

  document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", () => {
    syncActiveBatchState(null);
    appNotice = null;
    render();
  });

  async function generateBatchFromInputs() {
    const amount = document.querySelector<HTMLInputElement>("#amount")?.value ?? "0";
    const count = Number(document.querySelector<HTMLInputElement>("#count")?.value ?? "0");
    try {
      if (!walletAddress) {
        throw new Error("Connect a wallet before creating encrypted batch history.");
      }
      await unlockHistory(walletAddress);
      const nextCoupons = generateCouponSecrets(count, amount, cluster);
      const nextBatch: ClaimBatch = {
        id: crypto.randomUUID(),
        creator: walletAddress,
        cluster,
        createdAt: new Date().toISOString(),
        coupons: nextCoupons
      };

      batchAmountSol = amount.trim();
      batchCount = count;
      replaceBatch(nextBatch);
      await saveBatchToServer(nextBatch);
      historyStatus = `${batches.length} batches`;
      appNotice = null;
      render();
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Could not generate links",
        body: error instanceof Error ? error.message : String(error)
      });
      render();
    }
  }

  async function fundCurrentBatch() {
    try {
      setBusy(true);
      const creator = await connectAndTrackWallet();
      const signature = await fundCoupons(cluster, creator, coupons);
      const batch = currentBatch();
      if (batch) {
        const nextBatch = { ...batch, fundSignature: signature };
        replaceBatch(nextBatch);
        await saveBatchToServer(nextBatch);
      } else {
        lastFundSignature = signature;
      }
      await refreshBatchStatus(activeBatchId);
      await refreshWalletBalance();
      setNotice({
        tone: "success",
        title: "Batch funded",
        body: "The claim links are funded and ready to share.",
        href: explorer(signature),
        action: "View transaction"
      });
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Funding failed",
        body: fundingErrorMessage(error)
      });
    } finally {
      setBusy(false);
    }
  }

  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copy(button.dataset.copy ?? "");
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy link"), 900);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-qr-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.qrDownload ?? "-1");
      const coupon = coupons[index];
      if (!coupon) return;

      await downloadQrPng(`easy-grab-${String(index + 1).padStart(2, "0")}.png`, coupon.claimUrl);
      button.textContent = "Saved";
      setTimeout(() => (button.textContent = "Save QR"), 900);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-select-batch]").forEach((button) => {
    button.addEventListener("click", () => {
      const batch = batches.find((item) => item.id === button.dataset.selectBatch);
      if (!batch) return;
      syncActiveBatchState(batch);
      appNotice = null;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-refresh-batch]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        setBusy(true);
        await refreshBatchStatus(button.dataset.refreshBatch ?? "");
        setNotice({
          tone: "success",
          title: "Batch status refreshed",
          body: "Remaining balances and claimed links were updated from Solana RPC."
        });
      } catch (error) {
        setNotice({
          tone: "error",
          title: "Status refresh failed",
          body: friendlyActionError(error)
        });
      } finally {
        setBusy(false);
      }
    });
  });

  renderQrCodes();
}

function renderArchitecturePage() {
  renderShell(`
    <article class="doc-page">
      <header class="doc-hero">
        <button id="doc-back" class="doc-back">Back to app</button>
        <span>${BRAND_NAME} architecture</span>
        <h1>Claim links as a distribution primitive.</h1>
        <p>${BRAND_NAME} is a Solana-native way to create funded claim links for QR rewards, event campaigns, private payouts, and small-scale community distribution. This page explains how it works, where it fits, how claims move, and what the app verifies before sharing links.</p>
      </header>

      <section class="doc-grid">
        <aside class="doc-toc">
          <button data-doc-target="problem">Problem</button>
          <button data-doc-target="use">Use cases</button>
          <button data-doc-target="flow">Product flow</button>
          <button data-doc-target="technical">Technical model</button>
          <button data-doc-target="security">Security model</button>
          <button data-doc-target="links">Official links</button>
        </aside>

        <div class="doc-body">
          <section id="problem">
            <span>01</span>
            <h2>The problem</h2>
            <p>Most crypto payments assume the sender already knows the recipient wallet address. That works for direct transfers, but it is awkward for physical events, QR cards, street teams, booths, raffles, scavenger hunts, small creator rewards, and first-touch onboarding.</p>
            <p>${BRAND_NAME} flips the flow: the creator funds claim links first, then recipients either connect a wallet or paste a Solana address later. The reward becomes a link or QR code that can move through physical and social spaces before it is claimed.</p>
          </section>

          <section id="use">
            <span>02</span>
            <h2>Where ${BRAND_NAME} can be used</h2>
            <div class="doc-cards">
              <article><strong>Booths and conferences</strong><p>Print one QR per reward and hand them out to visitors without collecting wallet addresses.</p></article>
              <article><strong>Launch campaigns</strong><p>Generate a limited batch of funded links for early users, testers, or community contributors.</p></article>
              <article><strong>Private payouts</strong><p>Send a claim link when you know the recipient but not their wallet address yet.</p></article>
              <article><strong>Retail and pop-up rewards</strong><p>Give customers a QR reward after purchase, attendance, or participation.</p></article>
              <article><strong>Games and quests</strong><p>Place QR rewards inside physical or online quests where claiming is part of the experience.</p></article>
              <article><strong>Education and onboarding</strong><p>Let new users receive a small amount of SOL after they connect their first wallet.</p></article>
            </div>
          </section>

          <section id="flow">
            <span>03</span>
            <h2>Product flow</h2>
            <ol class="doc-steps">
              <li><strong>Connect wallet.</strong> The creator connects the wallet that will fund the drop.</li>
              <li><strong>Configure batch.</strong> The creator chooses SOL per claim and the number of links.</li>
              <li><strong>Generate links.</strong> The browser creates one temporary Solana keypair per claim link.</li>
              <li><strong>Save encrypted history.</strong> The browser encrypts the batch with a wallet-signature-derived key before sending it to the ${BRAND_NAME} API server.</li>
              <li><strong>Fund batch.</strong> The creator approves a transaction that transfers SOL to each temporary wallet.</li>
              <li><strong>Share QR or link.</strong> Each link can be copied, opened, or saved as a QR PNG.</li>
              <li><strong>Refresh status.</strong> The app checks each temporary wallet balance to show remaining SOL and claimed links.</li>
              <li><strong>Recipient claims.</strong> The recipient opens the link and either connects a wallet for the full amount or enters a Solana address for a wallet-free receive flow.</li>
            </ol>
          </section>

          <section id="technical">
            <span>04</span>
            <h2>Technical model</h2>
            <p>The current app uses an ephemeral funded wallet model. Each claim link controls one temporary Solana wallet. The creator funds the public key. The recipient uses the link secret to move the funded balance to a connected wallet or a pasted Solana address.</p>
            <div class="doc-spec">
              <div><strong>Network</strong><p>Solana devnet or mainnet-beta.</p></div>
              <div><strong>SDK</strong><p><code>@solana/web3.js</code> for keypairs, transactions, public keys, RPC, and system transfers.</p></div>
              <div><strong>Transfer</strong><p><code>SystemProgram.transfer</code> moves SOL from creator to coupon wallet, then from coupon wallet to recipient.</p></div>
              <div><strong>Claim secret</strong><p>Encoded Solana keypair secret carried in the URL fragment after <code>#</code>. Full bearer links should be shared only with the intended recipient.</p></div>
              <div><strong>Address claim</strong><p>The temporary claim wallet signs and pays the fee, sending the remaining balance to the pasted recipient address.</p></div>
              <div><strong>QR export</strong><p>Each claim URL can be rendered and saved as a PNG QR code.</p></div>
              <div><strong>Encrypted server history</strong><p>Batch history is encrypted in the browser with an AES-GCM key derived from a wallet message signature, then stored by blind storage id on the API server.</p></div>
              <div><strong>Status checks</strong><p>The app queries each coupon wallet balance to show funded, claimed, and remaining SOL status.</p></div>
            </div>
          </section>

          <section id="security">
            <span>05</span>
            <h2>Security model</h2>
            <p>${BRAND_NAME} is designed around a simple rule: the app should not hold a central hot wallet. Funds sit in temporary Solana wallets created by the browser. The API server stores encrypted batch history payloads indexed by a blind storage id.</p>
            <div class="doc-cards">
              <article><strong>No service wallet</strong><p>There is no ${BRAND_NAME} hot wallet holding all campaign funds.</p></article>
              <article><strong>Fragment-based links</strong><p>The claim secret is placed after <code>#</code>. Browsers do not send URL fragments in ordinary HTTP requests.</p></article>
              <article><strong>One-time sweep</strong><p>After a successful claim, the temporary wallet is emptied.</p></article>
              <article><strong>Encrypted history</strong><p>The server receives encrypted payloads. Decryption requires the connected wallet to sign the history unlock message again.</p></article>
              <article><strong>Blind storage id</strong><p>The server indexes history by a signature-derived storage id instead of a readable claim secret list.</p></article>
              <article><strong>Public checks</strong><p>The repository includes build checks, dependency audit, custom security checks, CodeQL, and release hash manifests.</p></article>
              <article><strong>Bearer links</strong><p>A full claim link is like a funded voucher. Whoever has the full link can claim it.</p></article>
            </div>
          </section>

          <section id="links">
            <span>06</span>
            <h2>Official links and references</h2>
            <div class="link-list">
              <a href="${OFFICIAL_LINKS.solanaDocs}" target="_blank" rel="noreferrer"><strong>Solana Docs</strong><em>Core concepts, accounts, transactions, programs, fees.</em></a>
              <a href="${OFFICIAL_LINKS.solanaJs}" target="_blank" rel="noreferrer"><strong>Solana JavaScript SDK Docs</strong><em>Official JavaScript client documentation.</em></a>
              <a href="${OFFICIAL_LINKS.solanaWeb3Github}" target="_blank" rel="noreferrer"><strong>@solana/web3.js GitHub</strong><em>SDK source used by this app.</em></a>
              <a href="${OFFICIAL_LINKS.phantomDocs}" target="_blank" rel="noreferrer"><strong>Phantom Developer Docs</strong><em>Wallet connection and wallet operations.</em></a>
              <a href="${OFFICIAL_LINKS.phantomSignTransaction}" target="_blank" rel="noreferrer"><strong>Phantom signTransaction</strong><em>Signing prepared Solana transactions.</em></a>
              <a href="${OFFICIAL_LINKS.solscan}" target="_blank" rel="noreferrer"><strong>Solscan</strong><em>Transaction and account inspection.</em></a>
              <a href="${OFFICIAL_LINKS.mdnLocationHash}" target="_blank" rel="noreferrer"><strong>MDN Location.hash</strong><em>Browser URL fragment behavior.</em></a>
              <a href="${OFFICIAL_LINKS.mdnWebCrypto}" target="_blank" rel="noreferrer"><strong>MDN Web Crypto API</strong><em>Browser cryptography used for encrypted server history.</em></a>
              <a href="${OFFICIAL_LINKS.vite}" target="_blank" rel="noreferrer"><strong>Vite</strong><em>Frontend build tool.</em></a>
              <a href="${OFFICIAL_LINKS.qrcode}" target="_blank" rel="noreferrer"><strong>qrcode npm package</strong><em>QR rendering and PNG export.</em></a>
              <a href="${OFFICIAL_X_URL}" target="_blank" rel="noreferrer"><strong>${BRAND_NAME} official X</strong><em>@easygrabfun</em></a>
              <a href="${GITHUB_URL}" target="_blank" rel="noreferrer"><strong>${BRAND_NAME} GitHub</strong><em>Public source repository.</em></a>
            </div>
          </section>
        </div>
      </section>
    </article>
  `);

  document.querySelectorAll<HTMLButtonElement>("[data-doc-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.docTarget;
      if (!target) return;
      const element = document.getElementById(target);
      if (!element) return;

      const topbar = document.querySelector<HTMLElement>(".topbar");
      const offset = (topbar?.offsetHeight ?? 0) + 34;
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  document.querySelector<HTMLButtonElement>("#doc-back")?.addEventListener("click", () => {
    navigateHome();
  });
}

function renderBatchSummary(batch: ClaimBatch) {
  const total = batch.coupons.reduce((sum, coupon) => sum + Number(coupon.amountSol || 0), 0);
  const checked = batch.coupons.some((coupon) => coupon.balanceLamports !== undefined);
  const claimed = batchClaimedCount(batch);
  const remaining = checked ? `${lamportsToSol(batchRemainingLamports(batch))} SOL` : "Unchecked";
  return { total, checked, claimed, remaining };
}

function renderCoupons(batch: ClaimBatch) {
  const summary = renderBatchSummary(batch);
  return `
    <section class="coupon-panel">
      <div class="section-head row-head">
        <div>
          <span>Current batch</span>
          <h2>${batch.coupons.length} claim links</h2>
          <p>Created ${formatUtc(batch.createdAt)} UTC</p>
        </div>
        <div class="batch-actions">
          <div class="batch-total">${summary.total.toLocaleString("en-US", { maximumFractionDigits: 9 })} SOL total</div>
          <button class="ghost-button" data-refresh-batch="${escapeHtml(batch.id)}" ${busy ? "disabled" : ""}>Refresh status</button>
        </div>
      </div>
      <div class="batch-stats">
        <div><span>Remaining</span><strong>${summary.remaining}</strong></div>
        <div><span>Claimed</span><strong>${summary.claimed}/${batch.coupons.length}</strong></div>
        <div><span>Funding tx</span><strong>${batch.fundSignature ? "Recorded" : "Pending"}</strong></div>
      </div>
      <div class="coupon-list">
        ${batch.coupons
          .map((coupon, index) => {
            const claimed = isCouponClaimed(coupon);
            return `
              <article class="coupon ${claimed ? "is-claimed" : ""}">
                <div class="qr-frame"><canvas data-qr="${escapeHtml(coupon.claimUrl)}"></canvas></div>
                <div class="coupon-body">
                  <div>
                    <span>${TICKER} ${String(index + 1).padStart(2, "0")} - ${couponStatus(coupon)}</span>
                    <strong>${escapeHtml(coupon.amountSol)} SOL</strong>
                  </div>
                  <p>${coupon.balanceLamports === undefined ? "Balance not checked" : `${lamportsToSol(coupon.balanceLamports)} SOL remaining`}</p>
                  <div class="coupon-actions">
                    <button class="copy-button" data-copy="${escapeHtml(coupon.claimUrl)}" ${claimed ? "disabled" : ""}>${claimed ? "Claimed" : "Copy link"}</button>
                    <button class="qr-button" data-qr-download="${index}" ${claimed ? "disabled" : ""}>${claimed ? "Closed" : "Save QR"}</button>
                    ${
                      claimed
                        ? `<span class="claimed-lock">Claim complete</span>`
                        : `<a class="open-link" href="${escapeHtml(coupon.claimUrl)}">Open claim</a>`
                    }
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
      <p class="guidance">Share each funded link with its intended recipient or print it as a one-time QR reward.</p>
    </section>
  `;
}

function renderBatchHistory() {
  if (!walletAddress) {
    return "";
  }

  return `
    <section class="history-panel">
      <div class="section-head row-head">
        <div>
          <span>Encrypted server history</span>
          <h2>${batches.length ? `${batches.length} saved batches` : "No saved batches yet"}</h2>
          <p>Encrypted batches from this wallet unlock here after signature approval.</p>
        </div>
      </div>
      ${
        batches.length
          ? `<div class="history-list">
              ${batches
                .map((batch) => {
                  const summary = renderBatchSummary(batch);
                  return `
                    <article class="history-item ${batch.id === activeBatchId ? "is-active" : ""}">
                      <button data-select-batch="${escapeHtml(batch.id)}">
                        <strong>${formatUtc(batch.createdAt)} UTC</strong>
                        <span>${batch.coupons.length} links - ${summary.remaining} remaining - ${summary.claimed}/${batch.coupons.length} claimed</span>
                      </button>
                      <button class="ghost-button" data-refresh-batch="${escapeHtml(batch.id)}" ${busy ? "disabled" : ""}>Refresh</button>
                    </article>
                  `;
                })
                .join("")}
            </div>`
          : `<p class="guidance">Generated batches will appear here.</p>`
      }
    </section>
  `;
}

function renderEmptyState() {
  return `
    <section class="empty-state">
      <div>
        <span>Nothing generated yet</span>
        <h2>Your first batch will appear here</h2>
      </div>
    </section>
  `;
}

function uniqueClusters(preferredCluster?: Cluster) {
  return Array.from(new Set([preferredCluster, cluster, cluster === "devnet" ? "mainnet-beta" : "devnet"].filter(Boolean))) as Cluster[];
}

async function resolveClaimBalance(secret: string, preferredCluster?: Cluster) {
  const coupon = couponFromSecret(secret);
  const attempts: { cluster: Cluster; balance: number }[] = [];

  for (const targetCluster of uniqueClusters(preferredCluster)) {
    const balance = await getRpcBalance(getConnection(targetCluster), coupon.publicKey);
    attempts.push({ cluster: targetCluster, balance });
    if (balance > 0) {
      return { publicKey: coupon.publicKey.toBase58(), balance, cluster: targetCluster };
    }
  }

  const fallback = attempts.find((attempt) => attempt.cluster === preferredCluster) ?? attempts[0];
  return {
    publicKey: coupon.publicKey.toBase58(),
    balance: fallback?.balance ?? 0,
    cluster: fallback?.cluster ?? preferredCluster ?? cluster
  };
}

async function renderClaim(secret: string, routeCluster?: Cluster) {
  let publicKey = "";
  let balanceLabel = "Checking...";
  let balanceLamports = 0;
  let invalidMessage = "";
  let claimCluster: Cluster = routeCluster ?? cluster;

  try {
    const resolved = await resolveClaimBalance(secret, routeCluster);
    publicKey = resolved.publicKey;
    balanceLamports = resolved.balance;
    claimCluster = resolved.cluster;
    cluster = claimCluster;
    balanceLabel = `${lamportsToSol(balanceLamports)} SOL`;
  } catch (error) {
    invalidMessage = error instanceof Error ? error.message : "Invalid claim link";
    balanceLabel = "Invalid link";
  }

  const isClaimed = publicKey && balanceLamports <= 0;
  const canClaim = Boolean(publicKey && balanceLamports > 0);

  renderShell(`
    <section class="claim-wrap">
      <div class="claim-card ${isClaimed ? "is-claimed" : ""}">
        <span>${BRAND_NAME} link</span>
        <h1>${escapeHtml(balanceLabel)}</h1>
        ${publicKey ? `<div class="claim-network">${claimCluster === "devnet" ? "Devnet" : "Mainnet"}</div>` : ""}
        ${
          invalidMessage
            ? `<div class="claim-complete"><strong>Claim link unavailable</strong><p>${escapeHtml(invalidMessage)}</p></div>`
            : isClaimed
              ? `<div class="claim-complete"><strong>This link has already been claimed.</strong><p>The funded wallet is empty, so there is nothing left to receive from this link.</p></div>`
              : `<div class="claim-methods">
                  <div class="claim-method">
                    <strong>Connect wallet</strong>
                    <p>Receive the full claim amount. Your wallet signs the receive transaction and pays the network fee.</p>
                    <button id="claim" class="primary-button wide" ${busy || !canClaim ? "disabled" : ""}>Claim with wallet</button>
                  </div>
                  <div class="claim-method">
                    <strong>Enter address</strong>
                    <p>Receive without connecting a wallet. The link balance pays the network fee, so the received amount is slightly lower.</p>
                    <input id="claim-address" class="address-input" placeholder="Solana wallet address" ${busy || !canClaim ? "disabled" : ""} />
                    <button id="claim-address-button" class="dark-button wide" ${busy || !canClaim ? "disabled" : ""}>Send to address</button>
                  </div>
                </div>`
        }
        ${renderNotice()}
      </div>
      <aside class="claim-aside">
        <strong>Two ways to receive</strong>
        <p>Use a connected wallet for the full amount, or paste a Solana address to receive without connecting. Address claims use the funded link to pay the network fee.</p>
      </aside>
    </section>
  `);

  document.querySelector<HTMLButtonElement>("#claim")?.addEventListener("click", async () => {
    try {
      setBusy(true);
      const recipient = await connectWallet();
      walletAddress = recipient.toBase58();
      const result = await claimCoupon(claimCluster, recipient, secret);
      setNotice({
        tone: "success",
        title: "Claim complete",
        body: `${lamportsToSol(result.balance)} SOL was sent to your wallet.`,
        href: explorer(result.signature),
        action: "View transaction"
      });
      await renderClaim(secret, claimCluster);
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Claim failed",
        body: friendlyActionError(error)
      });
      render();
    } finally {
      setBusy(false);
    }
  });

  document.querySelector<HTMLButtonElement>("#claim-address-button")?.addEventListener("click", async () => {
    try {
      setBusy(true);
      const input = document.querySelector<HTMLInputElement>("#claim-address");
      const recipient = new PublicKey(input?.value.trim() || "");
      const result = await claimCouponToAddress(claimCluster, recipient, secret);
      setNotice({
        tone: "success",
        title: "Sent to address",
        body: `${lamportsToSol(result.balance)} SOL was sent. Network fee: ${lamportsToSol(result.fee)} SOL.`,
        href: explorer(result.signature),
        action: "View transaction"
      });
      await renderClaim(secret, claimCluster);
    } catch (error) {
      setNotice({
        tone: "error",
        title: "Address claim failed",
        body: friendlyActionError(error)
      });
      render();
    } finally {
      setBusy(false);
    }
  });
}

function render() {
  const claimRoute = parseClaimRoute();
  if (claimRoute) {
    void renderClaim(claimRoute.secret, claimRoute.cluster);
    return;
  }

  if (isArchitectureRoute()) {
    renderArchitecturePage();
    return;
  }

  renderCreate();
}

function scrollToPageTop() {
  requestAnimationFrame(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  });
}

window.addEventListener("popstate", () => {
  render();
});

window.addEventListener("hashchange", () => {
  render();
});

render();
