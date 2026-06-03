import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://almajd-chat.app"),
  title: {
    default: "ALMAJD",
    template: "%s | ALMAJD"
  },
  description: "ALMAJD is a modern workspace chat experience for teams to connect, collaborate, and create.",
  applicationName: "ALMAJD",
  manifest: "/manifest.json",
  keywords: ["ALMAJD", "team chat", "workspace messaging", "collaboration", "real-time chat"],
  authors: [{ name: "ALMAJD" }],
  creator: "ALMAJD",
  publisher: "ALMAJD",
  openGraph: {
    title: "ALMAJD",
    description: "Connect. Collaborate. Create.",
    siteName: "ALMAJD",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "ALMAJD",
    description: "Connect. Collaborate. Create."
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  },
  appleWebApp: {
    capable: true,
    title: "ALMAJD",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
