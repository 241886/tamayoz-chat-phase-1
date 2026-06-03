"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NexusLogo } from "@/components/brand/NexusLogo";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { isReady } = useAuth();

  useEffect(() => {
    if (!isReady) {
      return;
    }
    router.replace("/chat");
  }, [isReady, router]);

  return (
    <main className="app-cinematic flex min-h-screen items-center justify-center overflow-hidden px-4 text-white">
      <div className="glass-panel flex w-full max-w-sm flex-col items-center gap-5 rounded-[2rem] p-8 text-center shadow-nexus">
        <NexusLogo size="lg" />
        <p className="text-sm text-white/45">Connect. Collaborate. Create.</p>
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-purple border-t-transparent" />
      </div>
    </main>
  );
}
