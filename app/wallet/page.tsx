import type { Metadata } from "next";
import { WalletClient } from "./wallet-client";

export const metadata: Metadata = { title: "果子钱包" };

export default function WalletPage() {
  return <WalletClient />;
}
