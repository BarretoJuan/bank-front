"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [hasToken, setHasToken] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const backend = process.env.NEXT_PUBLIC_BACK_URL;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasToken(!!localStorage.getItem("accessToken"));
  }, [pathname]);

  // Reset signingOut once auth state changes (e.g., after logging back in)
  useEffect(() => {
    if (hasToken && signingOut) {
      setSigningOut(false);
    }
  }, [hasToken, signingOut]);

  const logout = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const access = localStorage.getItem("accessToken");
      const refresh = localStorage.getItem("refreshToken");
      if (backend && access) {
        fetch(`${backend}/auth/sign-out`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}` },
          body: JSON.stringify({ refreshToken: refresh }),
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      router.replace("/login");
    }
  }, [backend, router, signingOut]);

  function openTransfer() {
    const sp = new URLSearchParams(params.toString());
    sp.set("open", "transfer");
    if (pathname === "/dashboard") {
      router.replace(`/dashboard?${sp.toString()}`);
    } else {
      router.push(`/dashboard?${sp.toString()}`);
    }
  }

  const onDashboard = pathname === "/dashboard";

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 backdrop-blur supports-[backdrop-filter]:bg-[#0b0223]/70 bg-[#0b0223]/90 border-b border-white/10 flex items-center px-5 md:px-10 z-50">
      <div className="flex items-center gap-6 w-full">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative w-32 h-10">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-3 md:gap-4">
          {hasToken && onDashboard && (
            <>
              <button
                onClick={openTransfer}
                className="h-10 px-4 rounded-md text-sm font-medium bg-[#8154ff] hover:bg-[#905dff] text-white border border-[#8154ff] shadow shadow-[#8154ff]/40 transition"
              >
                Enviar dinero
              </button>
              <button
                onClick={logout}
                disabled={signingOut}
                className="h-10 px-4 rounded-md text-sm font-medium bg-transparent text-red-300 hover:text-red-200 border border-red-400/40 hover:border-red-400 transition disabled:opacity-40"
              >
                {signingOut ? "Cerrando..." : "Cerrar sesión"}
              </button>
            </>
          )}
          {!hasToken && (
            <>
              {pathname !== "/login" && (
                <Link href="/login" className="h-10 px-4 rounded-md text-sm font-medium border border-white/25 hover:border-[#8154ff] hover:text-white transition text-white/70 flex items-center justify-center">
                  Iniciar sesión
                </Link>
              )}
              {pathname !== "/sign-up" && (
                <Link href="/sign-up" className="h-10 px-4 rounded-md text-sm font-medium bg-[#8154ff] hover:bg-[#905dff] text-white border border-[#8154ff] shadow shadow-[#8154ff]/40 transition flex items-center justify-center">
                  Registrarse
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
