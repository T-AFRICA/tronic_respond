import type { Metadata } from "next";
import { Inter, Archivo_Black } from "next/font/google";
import "./globals.css";

/**
 * Typography: Inter for UI (professional stand-in until the licensed
 * Myriad Pro files are supplied), Archivo Black for display headings
 * (Arial Black-class weight, properly hinted for the web).
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo-black",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TRONIC Response",
    template: "%s | TRONIC Response",
  },
  description:
    "TRONIC Response — WhatsApp-first sales enablement platform. Faster Responses. Smarter Sales.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${archivoBlack.variable}`}>
      <body>{children}</body>
    </html>
  );
}
