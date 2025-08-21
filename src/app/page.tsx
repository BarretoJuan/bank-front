"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = getAccessToken();
    if (token) router.replace("/dashboard"); else router.replace("/login");
  }, [router]);
  return null; // immediate redirect
}
