import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meritr — Cross-Chain Credit Risk Memory OS",
  description:
    "Autonomous DeAI debt restructuring on Creditcoin mainnet. Cross-chain credit scored from " +
    "transactions proven through the Attestcoin native query verifier precompile (0xFD2), and " +
    "distressed loans restructured before they can be liquidated.",
  metadataBase: new URL("https://meritr.app"),
  openGraph: {
    title: "Meritr — Cross-Chain Credit Risk Memory OS",
    description:
      "Provable cross-chain credit on Creditcoin. Autonomous restructuring instead of liquidation.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
