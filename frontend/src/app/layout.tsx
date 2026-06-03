import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nexus-chat.app"),
  title: {
    default: "Nexus",
    template: "%s | Nexus"
  },
  description: "Nexus is a modern workspace chat experience for teams to connect, collaborate, and create.",
  applicationName: "Nexus",
  manifest: "/manifest.json",
  keywords: ["Nexus", "team chat", "workspace messaging", "collaboration", "real-time chat"],
  authors: [{ name: "Nexus" }],
  creator: "Nexus",
  publisher: "Nexus",
  openGraph: {
    title: "Nexus",
    description: "Connect. Collaborate. Create.",
    siteName: "Nexus",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Nexus",
    description: "Connect. Collaborate. Create."
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
