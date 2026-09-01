import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meritr — Cross-Chain Credit Risk Memory OS",
  description:
    "Autonomous DeAI debt restructuring on Creditcoin. Cross-chain credit scored from " +
    "transactions proven through the Attestcoin native query verifier precompile (0xFD2).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
