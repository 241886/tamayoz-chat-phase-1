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
    <main className="flex min-h-screen items-center justify-center bg-nexus-dark text-white">
      <div className="flex flex-col items-center gap-5">
        <NexusLogo size="lg" />
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    </main>
  );
}
