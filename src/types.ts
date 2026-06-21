export type Cluster = "devnet" | "mainnet-beta";

export type Coupon = {
  id: string;
  publicKey: string;
  secret: string;
  claimUrl: string;
  amountSol: string;
  balanceLamports?: number;
  checkedAt?: string;
};

export type ClaimBatch = {
  id: string;
  creator: string;
  cluster: Cluster;
  createdAt: string;
  coupons: Coupon[];
  fundSignature?: string;
};

export type BatchStatus = "draft" | "funded" | "partially-claimed" | "claimed";

export type WalletProvider = {
  publicKey?: { toString(): string };
  isPhantom?: boolean;
  isSolflare?: boolean;
  isCoinbaseWallet?: boolean;
  connect(input?: unknown): Promise<void | { publicKey?: { toString(): string } }>;
  disconnect?(): Promise<void>;
  signMessage?(
    message: Uint8Array,
    display?: "utf8" | "hex"
  ): Promise<Uint8Array | number[] | { signature: Uint8Array | number[]; publicKey?: { toString(): string } }>;
  signTransaction<T>(transaction: T): Promise<T>;
};

export type WalletOption = {
  id: "phantom" | "solflare" | "coinbase";
  name: string;
  installed: boolean;
  installUrl: string;
  provider?: WalletProvider;
};

declare global {
  interface Window {
    solana?: WalletProvider;
    phantom?: {
      solana?: WalletProvider;
    };
    solflare?: WalletProvider;
    coinbaseSolana?: WalletProvider;
    coinbaseWalletExtension?: {
      solana?: WalletProvider;
    };
  }
}
