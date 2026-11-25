import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
