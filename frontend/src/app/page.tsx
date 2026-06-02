"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
    <main className="flex min-h-screen items-center justify-center bg-mist text-ink dark:bg-slate-950 dark:text-white">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
    </main>
  );
}
