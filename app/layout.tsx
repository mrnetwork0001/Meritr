import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "./lib/wallet";
import { TxProvider } from "./components/TxModal";

/**
 * Inter for everything the reader reads, JetBrains Mono for everything they compare.
 *
 * Meritr previously set monospace as the body face, which made a credit protocol read as a
 * terminal transcript. Hierarchy now comes from weight and tight tracking; mono is reserved
 * for figures, addresses and code — the places where character alignment actually matters.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://meritr.app"),
  title: {
    default: "Meritr — Cross-Chain Credit Risk Memory OS",
    template: "%s · Meritr",
  },
  description:
    "Autonomous DeAI debt restructuring on Creditcoin. Real cross-chain credit history proven " +
    "through the Attestcoin verifier precompile, and distressed loans restructured before they " +
    "can be liquidated.",
  openGraph: {
    title: "Meritr — Cross-Chain Credit Risk Memory OS",
    description:
      "Prove the history. Keep the collateral. Autonomous debt restructuring on Creditcoin.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans">
        <WalletProvider>
          <TxProvider>{children}</TxProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
