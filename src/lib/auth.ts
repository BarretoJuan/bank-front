export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function clearAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  } catch {}
}

// Returns true if handled (redirected)
export function handleUnauthorized(status: number, router: { replace: (p: string) => void }) {
  if (status === 401) {
    clearAuthStorage();
    router.replace("/login");
    return true;
  }
  return false;
}
