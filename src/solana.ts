import {
  Commitment,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedMessage
} from "@solana/web3.js";
import bs58 from "bs58";
import type { Cluster, Coupon, WalletOption, WalletProvider } from "./types";

export const MAX_COUPONS_PER_BATCH = 12;
export const MIN_CLAIM_SOL = "0.01";
export const MIN_CLAIM_LAMPORTS = 10_000_000;

let activeWallet: WalletProvider | null = null;
let rpcQueue = Promise.resolve();

const RPC_MIN_GAP_MS = Number(import.meta.env.VITE_RPC_MIN_GAP_MS ?? "140");
const RPC_RETRY_DELAYS_MS = [800, 1600, 3200, 5200];
const QUICK_CONFIRM_TIMEOUT_MS = 12_000;

export type SubmittedTransaction = {
  signature: string;
  confirmed: boolean;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTransientRpcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("429") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("temporarily unavailable") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("failed to fetch")
  );
}

async function queuedRpc<T>(operation: () => Promise<T>) {
  const previous = rpcQueue;
  let releaseQueue = () => {};
  rpcQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previous.catch(() => undefined);

  try {
    for (let attempt = 0; attempt <= RPC_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isTransientRpcError(error) || attempt === RPC_RETRY_DELAYS_MS.length) {
          throw error;
        }
        await wait(RPC_RETRY_DELAYS_MS[attempt]);
      }
    }

    return await operation();
  } finally {
    await wait(RPC_MIN_GAP_MS);
    releaseQueue();
  }
}

function rpcUrl(cluster: Cluster) {
  const configured =
    cluster === "devnet"
      ? import.meta.env.VITE_DEVNET_RPC_URL?.trim()
      : import.meta.env.VITE_MAINNET_RPC_URL?.trim();

  if (configured) return configured;

  return cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com";
}

export function getConnection(cluster: Cluster) {
  return new Connection(rpcUrl(cluster), "confirmed");
}

export function getRpcLabel(cluster: Cluster) {
  return rpcUrl(cluster).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export async function getRpcBalance(connection: Connection, publicKey: PublicKey, commitment: Commitment = "confirmed") {
  return queuedRpc(() => connection.getBalance(publicKey, commitment));
}

export async function getRpcBalances(
  connection: Connection,
  publicKeys: PublicKey[],
  commitment: Commitment = "confirmed"
) {
  if (!publicKeys.length) return [];
  const accounts = await queuedRpc(() => connection.getMultipleAccountsInfo(publicKeys, commitment));
  return accounts.map((account) => account?.lamports ?? 0);
}

export async function getRpcLatestBlockhash(connection: Connection) {
  return queuedRpc(() => connection.getLatestBlockhash());
}

export async function sendRpcRawTransaction(connection: Connection, serialized: Buffer | Uint8Array | number[]) {
  return queuedRpc(() =>
    connection.sendRawTransaction(serialized, {
      skipPreflight: false
    })
  );
}

export async function confirmRpcTransaction(connection: Connection, signature: string) {
  return queuedRpc(() => connection.confirmTransaction(signature, "confirmed"));
}

export async function getRpcSignatureStatuses(connection: Connection, signatures: string[]) {
  return queuedRpc(() => connection.getSignatureStatuses(signatures, { searchTransactionHistory: true }));
}

async function quickConfirmTransaction(connection: Connection, signature: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < QUICK_CONFIRM_TIMEOUT_MS) {
    const status = (await getRpcSignatureStatuses(connection, [signature])).value[0];

    if (status?.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return true;
    }

    await wait(1000);
  }

  return false;
}

export async function getRpcFeeForMessage(connection: Connection, message: VersionedMessage) {
  return queuedRpc(() => connection.getFeeForMessage(message, "confirmed"));
}

export function getDetectedWallets(): WalletOption[] {
  const phantom = window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined);
  const solflare = window.solflare ?? (window.solana?.isSolflare ? window.solana : undefined);
  const coinbase =
    window.coinbaseSolana ??
    window.coinbaseWalletExtension?.solana ??
    (window.solana?.isCoinbaseWallet ? window.solana : undefined);

  return [
    {
      id: "phantom",
      name: "Phantom",
      installed: Boolean(phantom),
      provider: phantom,
      installUrl: "https://phantom.com/download"
    },
    {
      id: "solflare",
      name: "Solflare",
      installed: Boolean(solflare),
      provider: solflare,
      installUrl: "https://solflare.com/download"
    },
    {
      id: "coinbase",
      name: "Coinbase Wallet",
      installed: Boolean(coinbase),
      provider: coinbase,
      installUrl: "https://www.coinbase.com/wallet/downloads"
    }
  ];
}

export function selectWalletProvider(id: WalletOption["id"]) {
  const wallet = getDetectedWallets().find((item) => item.id === id);
  if (!wallet?.provider) {
    throw new Error(`${wallet?.name ?? "Selected wallet"} is not installed in this browser.`);
  }

  activeWallet = wallet.provider;
}

export function getWallet(): WalletProvider {
  if (activeWallet) {
    return activeWallet;
  }

  const fallback = getDetectedWallets().find((wallet) => wallet.installed)?.provider ?? window.solana;

  if (!fallback) {
    throw new Error("No supported Solana wallet found. Install Phantom, Solflare, or Coinbase Wallet.");
  }

  activeWallet = fallback;
  return fallback;
}

export async function connectWallet() {
  const wallet = getWallet();
  const result = await wallet.connect();
  const publicKey = result?.publicKey ?? wallet.publicKey;

  if (!publicKey) {
    throw new Error("Wallet connected, but no Solana public key was returned.");
  }

  return new PublicKey(publicKey.toString());
}

export async function disconnectWallet() {
  await getWallet().disconnect?.();
  activeWallet = null;
}

export async function signWalletMessage(message: string) {
  const wallet = getWallet();
  if (!wallet.signMessage) {
    throw new Error("This wallet does not support message signing for encrypted history.");
  }

  const result = await wallet.signMessage(new TextEncoder().encode(message), "utf8");
  const signature = Array.isArray(result) || result instanceof Uint8Array ? result : result.signature;
  return signature instanceof Uint8Array ? signature : new Uint8Array(signature);
}

export function solToLamports(amount: string) {
  const normalized = amount.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(normalized)) {
    throw new Error("Enter a SOL amount with up to 9 decimals.");
  }

  const [whole, fractional = ""] = normalized.split(".");
  const paddedFraction = fractional.padEnd(9, "0");
  const lamports = BigInt(whole) * BigInt(LAMPORTS_PER_SOL) + BigInt(paddedFraction);

  if (lamports <= 0n) {
    throw new Error("Coupon amount must be greater than zero.");
  }

  if (lamports < BigInt(MIN_CLAIM_LAMPORTS)) {
    throw new Error(`SOL per claim must be at least ${MIN_CLAIM_SOL} SOL.`);
  }

  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large for this version.");
  }

  return Number(lamports);
}

export function lamportsToSol(lamports: number) {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString("en-US", {
    maximumFractionDigits: 9
  });
}

export function couponBatchLamports(coupons: Coupon[]) {
  return coupons.reduce((sum, coupon) => sum + solToLamports(coupon.amountSol), 0);
}

export function fundingTotalLamports(coupons: Coupon[]) {
  return couponBatchLamports(coupons) + 10_000;
}

export async function getWalletBalance(cluster: Cluster, wallet: PublicKey) {
  return getRpcBalance(getConnection(cluster), wallet);
}

export function buildClaimUrl(secret: string, cluster: Cluster) {
  const configuredBase = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  const base = configuredBase
    ? configuredBase.replace(/\/+$/, "")
    : `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}`;
  return `${base}#/claim/${cluster}/${secret}`;
}

export function parseClaimRoute() {
  const match = window.location.hash.match(/^#\/claim\/(?:(devnet|mainnet-beta)\/)?([1-9A-HJ-NP-Za-km-z]+)$/);
  if (!match) return null;

  return {
    cluster: match[1] as Cluster | undefined,
    secret: match[2]
  };
}

export function generateCouponSecrets(count: number, amountSol: string, cluster: Cluster): Coupon[] {
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUPONS_PER_BATCH) {
    throw new Error(`Create between 1 and ${MAX_COUPONS_PER_BATCH} coupons per batch.`);
  }

  return Array.from({ length: count }, (_, index) => {
    const keypair = Keypair.generate();
    const secret = bs58.encode(keypair.secretKey);
    return {
      id: `coupon-${Date.now()}-${index + 1}`,
      publicKey: keypair.publicKey.toBase58(),
      secret,
      claimUrl: buildClaimUrl(secret, cluster),
      amountSol
    };
  });
}

export async function fundCoupons(cluster: Cluster, creator: PublicKey, coupons: Coupon[]) {
  const wallet = getWallet();
  const connection = getConnection(cluster);
  const totalLamports = fundingTotalLamports(coupons);
  const balance = await getRpcBalance(connection, creator);

  if (balance < totalLamports) {
    const networkName = cluster === "devnet" ? "Devnet" : "Mainnet";
    throw new Error(
      `${networkName} balance is ${lamportsToSol(balance)} SOL, but this batch needs about ${lamportsToSol(
        totalLamports
      )} SOL including the estimated network fee. Connected wallet: ${creator.toBase58()}`
    );
  }

  const transaction = new Transaction();

  for (const coupon of coupons) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: creator,
        toPubkey: new PublicKey(coupon.publicKey),
        lamports: solToLamports(coupon.amountSol)
      })
    );
  }

  transaction.feePayer = creator;
  transaction.recentBlockhash = (await getRpcLatestBlockhash(connection)).blockhash;

  const signed = await wallet.signTransaction(transaction);
  const signature = await sendRpcRawTransaction(connection, signed.serialize());
  const confirmed = await quickConfirmTransaction(connection, signature);
  return { signature, confirmed };
}

export function couponFromSecret(secret: string) {
  let secretBytes: Uint8Array;

  try {
    secretBytes = bs58.decode(secret);
  } catch {
    throw new Error("This claim link is malformed.");
  }

  if (secretBytes.length !== 64) {
    throw new Error("This claim secret is not a Solana keypair.");
  }

  return Keypair.fromSecretKey(secretBytes);
}

export async function claimCoupon(cluster: Cluster, recipient: PublicKey, secret: string) {
  const wallet = getWallet();
  const connection = getConnection(cluster);
  const couponKeypair = couponFromSecret(secret);
  const balance = await getRpcBalance(connection, couponKeypair.publicKey);

  if (balance <= 0) {
    throw new Error("This coupon has no claimable SOL. It may already be claimed.");
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: couponKeypair.publicKey,
      toPubkey: recipient,
      lamports: balance
    })
  );

  transaction.feePayer = recipient;
  transaction.recentBlockhash = (await getRpcLatestBlockhash(connection)).blockhash;
  transaction.partialSign(couponKeypair);

  const signed = await wallet.signTransaction(transaction);
  const signature = await sendRpcRawTransaction(connection, signed.serialize());
  const confirmed = await quickConfirmTransaction(connection, signature);
  return { signature, balance, confirmed };
}

export async function claimCouponToAddress(cluster: Cluster, recipient: PublicKey, secret: string) {
  const connection = getConnection(cluster);
  const couponKeypair = couponFromSecret(secret);
  const balance = await getRpcBalance(connection, couponKeypair.publicKey);

  if (balance <= 0) {
    throw new Error("This coupon has no claimable SOL. It may already be claimed.");
  }

  const { blockhash } = await getRpcLatestBlockhash(connection);
  const transaction = new Transaction();
  transaction.feePayer = couponKeypair.publicKey;
  transaction.recentBlockhash = blockhash;

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: couponKeypair.publicKey,
      toPubkey: recipient,
      lamports: 1
    })
  );

  const fee = (await getRpcFeeForMessage(connection, transaction.compileMessage())).value ?? 5000;
  const claimableLamports = balance - fee;

  if (claimableLamports <= 0) {
    throw new Error("This coupon balance is too small to pay the network fee.");
  }

  transaction.instructions = [];
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: couponKeypair.publicKey,
      toPubkey: recipient,
      lamports: claimableLamports
    })
  );

  transaction.sign(couponKeypair);
  const signature = await sendRpcRawTransaction(connection, transaction.serialize());
  const confirmed = await quickConfirmTransaction(connection, signature);
  return { signature, balance: claimableLamports, fee, confirmed };
}
