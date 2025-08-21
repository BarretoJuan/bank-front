"use client";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { getAccessToken, handleUnauthorized } from "@/lib/auth";

interface UserResponse {
  first_name: string;
  last_name: string;
  email: string;
  balance?: number;
}

type TxType = "withdrawal" | "deposit" | "transfer";
interface Transaction {
  id: string;
  amount: number;
  type: TxType;
  created_at: string;
  senderEmail?: string;
  recipientEmail?: string;
  isPositive?: boolean; // server-provided flag for sign of amount
}

const typeToSpanish: Record<string, string> = {
  withdrawal: "Retiro",
  deposit: "Depósito",
  transfer: "Transferencia",
};

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const filter = params.get("type") as TxType | null;
  const [user, setUser] = useState<UserResponse | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<null | "withdraw" | "deposit" | "transfer">(null);
  const [amount, setAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // In-memory cache: filter key => transactions list (clears on page reload or after mutation)
  const txCacheRef = useRef<Record<string, Transaction[]>>({});
  // Track in-flight requests per filter to dedupe rapid tab changes
  const inFlightRef = useRef<Record<string, Promise<Transaction[]> | undefined>>({});

  const backend = process.env.NEXT_PUBLIC_BACK_URL;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!getAccessToken()) router.replace("/login");
  }, [router]);

  const fetchUser = useCallback(async (): Promise<void> => {
    if (!backend) return;
    setUserLoading(true);
    try {
  const token = getAccessToken();
      const res = await fetch(`${backend}/user`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
  if (handleUnauthorized(res.status, router)) return;
      if (!res.ok) throw new Error("No se pudo obtener el usuario");
      const data = await res.json();
      setUser(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setUserLoading(false);
    }
  }, [backend]);

  const fetchTxs = useCallback(async (force = false): Promise<void> => {
    if (!backend) return;
    const key = filter ? filter : "all";
    // Serve cached list if available and not forced
    if (!force && txCacheRef.current[key]) {
      setTxs(txCacheRef.current[key]);
      return;
    }
    // Await any ongoing fetch for the same key
    const inFlight = inFlightRef.current[key];
    if (!force && inFlight) {
      try {
        const existing = await inFlight;
        setTxs(existing);
      } catch {/* ignore */}
      return;
    }
    setTxLoading(true);
    setError(null);
    const token = getAccessToken();
    const qs = filter ? `?type=${filter}` : "";
    const promise = (async () => {
      const res = await fetch(`${backend}/user/transaction-history${qs}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (handleUnauthorized(res.status, router)) return [] as Transaction[];
      if (!res.ok) throw new Error("No se pudieron obtener las transacciones");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    })();
    inFlightRef.current[key] = promise;
    try {
      const list = await promise;
      txCacheRef.current[key] = list;
      setTxs(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      delete inFlightRef.current[key];
      setTxLoading(false);
    }
  }, [backend, filter, router]);

  const invalidateTxCache = useCallback(() => {
    txCacheRef.current = {};
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    fetchTxs(); // will use cache when available
  }, [fetchTxs]);

  function setFilter(f: TxType | null) {
    const search = new URLSearchParams(Array.from(params.entries()));
    if (f) search.set("type", f); else search.delete("type");
    router.replace(`/dashboard${search.toString() ? `?${search}` : ""}`);
  }

  function openModal(a: "withdraw" | "deposit" | "transfer") {
    setAction(a);
    setAmount("");
    setRecipientEmail("");
    setFormError(null);
    setSuccessMsg(null);
  }
  function closeModal() {
    setAction(null);
    // Clean up query param if present (e.g., open=transfer)
    const search = new URLSearchParams(Array.from(params.entries()));
    if (search.get("open")) {
      search.delete("open");
      router.replace(`/dashboard${search.toString() ? `?${search}` : ""}`);
    }
  }

  async function handleSubmitAction() {
    if (!backend || !action) return;
    setFormError(null);
    setSuccessMsg(null);
    const num = parseFloat(amount);
    if (Number.isNaN(num) || num <= 0) {
      setFormError("Ingresa una cantidad válida mayor a 0");
      return;
    }
    const balance = euroBalance(user);
    if ((action === "withdraw" || action === "transfer") && num > balance) {
      setFormError("La cantidad excede tu saldo disponible");
      return;
    }
    if (action === "transfer" && !recipientEmail) {
      setFormError("El correo del destinatario es obligatorio");
      return;
    }
    if (action === "transfer" && recipientEmail && user?.email && recipientEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) {
      setFormError("No puedes transferirte saldo a ti mismo");
      return;
    }
    setSubmitting(true);
    try {
      const token = getAccessToken();
      if (!token) {
        setFormError("Sesión no válida");
        router.replace("/login");
        return;
      }
  let endpoint = "";
  const body: Record<string, unknown> = { amount: num };
      if (action === "withdraw") endpoint = "/user/withdraw-balance";
      else if (action === "deposit") endpoint = "/user/deposit-balance";
      else if (action === "transfer") {
        endpoint = "/user/transfer-balance";
        body.recipientEmail = recipientEmail;
      }
      const res = await fetch(`${backend}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (handleUnauthorized(res.status, router)) {
        setFormError("Sesión no válida");
        return;
      }
      if (!res.ok) {
        let message: string | undefined;
        if (data && typeof data === "object" && "message" in data) {
          const maybeMsg = (data as { message?: unknown }).message;
          if (typeof maybeMsg === "string") message = maybeMsg;
        }
        setFormError(message || "Error en la transacción");
        return;
      }
      setSuccessMsg("Transacción exitosa");
      // Invalidate cache so subsequent tab visits refetch; then force reload current filter
      invalidateTxCache();
      fetchUser();
      fetchTxs(true);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  // Logout handled by Navbar; support external trigger of transfer modal
  useEffect(() => {
    const open = params.get("open");
    if (open === "transfer") {
      openModal("transfer");
    }
  }, [params]);

  return (
  <div className="relative min-h-screen text-white font-sans px-6 py-8 md:px-12">
      {/* Top Section */}
      <section className="bg-[#1b0f36] border border-white/10 rounded-xl p-6 md:p-8 flex flex-col md:flex-row md:items-start gap-8 shadow-lg shadow-[#8154ff]/10">
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between md:block gap-4">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {userLoading ? "Cargando..." : user ? `${user.first_name} ${user.last_name}` : "Usuario"}
            </h1>
            {/* Mobile balance inline */}
            <div className="md:hidden flex items-center gap-2 rounded-md px-3 py-2 bg-white/5 border border-white/10">
              <div className="relative w-5 h-5">
                <Image src="/eur.svg" alt="EUR" fill className="object-contain" />
              </div>
              <span className="text-lg font-semibold tabular-nums">
                {userLoading ? "--" : formatAmount(euroBalance(user))}
              </span>
            </div>
          </div>
          <p className="text-sm text-white/70">{user?.email}</p>
          <div className="pt-4 flex flex-wrap gap-3">
            <ActionButton label="Retirar" onClick={() => openModal("withdraw")} />
            <ActionButton label="Depositar" onClick={() => openModal("deposit")} />
            <ActionButton label="Enviar dinero" primary onClick={() => openModal("transfer")} />
          </div>
        </div>
        {/* Desktop balance panel */}
        <div className="hidden md:flex flex-col items-end justify-start min-w-[200px]">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <Image src="/eur.svg" alt="EUR" fill className="object-contain" />
            </div>
            <span className="text-3xl font-bold tabular-nums">
              {userLoading ? "--" : formatAmount(euroBalance(user))}
            </span>
          </div>
          <span className="text-sm text-white/60 font-medium mt-1 flex items-center gap-2">Saldo EUR</span>
        </div>
      </section>

      {/* Filters */}
      <div className="mt-10 flex flex-wrap gap-4 border-b border-white/10 pb-2">
        <FilterTab current={filter} value={null} onClick={setFilter}>Todos</FilterTab>
        <FilterTab current={filter} value="withdrawal" onClick={setFilter}>Retiros</FilterTab>
        <FilterTab current={filter} value="deposit" onClick={setFilter}>Depósitos</FilterTab>
        <FilterTab current={filter} value="transfer" onClick={setFilter}>Transferencias</FilterTab>
      </div>

  {/* Transactions Table */}
  <div className="mt-6 overflow-x-auto custom-scroll">
        <table className="w-full text-sm border-separate border-spacing-y-1">
          <thead className="text-xs uppercase text-white/60">
            <tr>
              <th className="text-left px-4 py-2 font-medium">ID</th>
              <th className="text-left px-4 py-2 font-medium">Cantidad (€)</th>
              <th className="text-left px-4 py-2 font-medium">Tipo</th>
              <th className="text-left px-4 py-2 font-medium">Fecha</th>
              <th className="text-left px-4 py-2 font-medium">Remitente</th>
              <th className="text-left px-4 py-2 font-medium">Destinatario</th>
            </tr>
          </thead>
          <tbody>
            {txLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-white/50">Cargando...</td>
              </tr>
            )}
            {!txLoading && txs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-white/50">Sin transacciones</td>
              </tr>
            )}
            {!txLoading && txs.map(t => {
              const isTransfer = t.type === "transfer";
              const amountClass = t.isPositive === undefined
                ? "text-white"
                : t.isPositive
                  ? "text-emerald-400"
                  : "text-red-400";
              const sign = t.isPositive === undefined ? "" : t.isPositive ? "+" : "";
              const badgeClass = badgeClasses(t.type);
              return (
                <tr key={t.id} className="bg-[#1b0f36] hover:bg-[#241447] transition-colors">
                  <td className="px-4 py-3 text-white/60 max-w-[120px]">
                    <div className="flex items-center gap-2">
                      <span className="truncate" title={t.id}>{truncateId(t.id)}</span>
                      <CopyButton text={t.id} />
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-medium tabular-nums ${amountClass}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="relative w-4 h-4 inline-block">
                        <Image src="/eur.svg" alt="EUR" fill className="object-contain opacity-80" />
                      </span>
                      <span>{sign}{t.amount.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-[11px] font-medium leading-none align-middle ${badgeClass}`}>
                      {typeToSpanish[t.type] || t.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(t.created_at)}</td>
                  <td className="px-4 py-3 text-white/70">{isTransfer ? t.senderEmail : ""}</td>
                  <td className="px-4 py-3 text-white/70">{isTransfer ? t.recipientEmail : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="mt-6 text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-md p-3 max-w-md">
          {error}
        </div>
      )}

  <TxModal
    action={action}
    onClose={() => { if (!submitting) closeModal(); }}
    amount={amount}
    setAmount={setAmount}
    recipientEmail={recipientEmail}
    setRecipientEmail={setRecipientEmail}
    error={formError}
    success={successMsg}
    submitting={submitting}
    balance={euroBalance(user)}
    onSubmit={handleSubmitAction}
  />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="relative min-h-screen text-white font-sans px-6 py-8 md:px-12 animate-pulse">
      <section className="bg-[#1b0f36] border border-white/10 rounded-xl p-6 md:p-8 flex flex-col md:flex-row gap-8">
        <div className="flex-1 space-y-4">
          <div className="h-8 w-64 bg-white/10 rounded" />
          <div className="h-4 w-40 bg-white/10 rounded" />
          <div className="flex gap-3 pt-2">
            <div className="h-11 w-28 bg-white/10 rounded" />
            <div className="h-11 w-28 bg-white/10 rounded" />
            <div className="h-11 w-32 bg-white/10 rounded" />
          </div>
        </div>
        <div className="hidden md:flex flex-col items-end gap-2">
          <div className="h-10 w-40 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
        </div>
      </section>
      <div className="mt-10 flex gap-6">
        <div className="h-6 w-20 bg-white/10 rounded" />
        <div className="h-6 w-24 bg-white/10 rounded" />
        <div className="h-6 w-28 bg-white/10 rounded" />
      </div>
      <div className="mt-6 h-64 w-full bg-[#1b0f36] border border-white/10 rounded-xl" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}> 
      <DashboardInner />
    </Suspense>
  );
}

function ActionButton({ label, primary, onClick }: { label: string; primary?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
  onClick={onClick}
      className={`px-6 h-11 rounded-md text-sm font-medium tracking-wide border transition focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#8154ff]/50 ${
        primary
          ? "bg-[#8154ff] border-[#8154ff] hover:bg-[#905dff] shadow shadow-[#8154ff]/40"
          : "bg-transparent border-white/25 hover:border-[#8154ff]"
      }`}
    >
      {label}
    </button>
  );
}

// Hamburger menu removed

function FilterTab({ current, value, onClick, children }: { current: string | null; value: TxType | null; onClick: (v: TxType | null) => void; children: React.ReactNode; }) {
  const active = current === value || (!current && value === null);
  return (
    <button
      onClick={() => onClick(value)}
      className={`relative pb-2 text-sm font-medium transition px-1 ${active ? "text-white" : "text-white/50 hover:text-white"}`}
    >
      {children}
      {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#8154ff] rounded-full" />}
    </button>
  );
}

function formatDate(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function euroBalance(user: UserResponse | null) {
  if (!user) return 0;
  if (typeof user.balance === "number") return user.balance;
  return 0;
}

function formatAmount(v: number) {
  return new Intl.NumberFormat(undefined, { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function badgeClasses(type: TxType) {
  switch (type) {
    case "deposit":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-400/20";
    case "withdrawal":
      return "bg-red-500/15 text-red-300 border border-red-400/20";
    case "transfer":
      return "bg-indigo-500/15 text-indigo-300 border border-indigo-400/20";
    default:
      return "bg-white/10 text-white/70 border border-white/15";
  }
}

/* ---------------------------- Modal Logic & UI ---------------------------- */
function TxModal({ action, onClose, amount, setAmount, recipientEmail, setRecipientEmail, error, success, submitting, balance, onSubmit }: {
  action: null | "withdraw" | "deposit" | "transfer";
  onClose: () => void;
  amount: string;
  setAmount: (v: string) => void;
  recipientEmail: string;
  setRecipientEmail: (v: string) => void;
  error: string | null;
  success: string | null;
  submitting: boolean;
  balance: number;
  onSubmit: () => void;
}) {
  // Hook must run unconditionally (don't return early before hooks)
  useEffect(() => {
    if (!action) return; // guard inside effect instead
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, onClose, submitting]);

  if (!action) return null;
  const title = action === "withdraw" ? "Retiro" : action === "deposit" ? "Depósito" : "Transferencia";
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain">
      <div className="relative w-full sm:w-auto max-w-xl sm:my-10 flex flex-col animate-fade-in">
        <div className="relative w-full bg-[#120629] border border-white/10 shadow-2xl shadow-black/50 sm:rounded-2xl rounded-none p-6 sm:p-10 max-h-[92vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition"
            aria-label="Cerrar"
            disabled={submitting}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <h2 className="text-2xl font-semibold mb-8 pr-10">{title}</h2>
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-8">
            {/* Amount Field */}
            <div>
              <label className="block text-sm font-medium mb-2 text-white/70">Cantidad (EUR) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-12 rounded-lg bg-transparent border border-white/25 focus:border-[#8154ff] focus:ring-2 focus:ring-[#8154ff]/40 px-4 text-sm outline-none transition text-white placeholder:text-white/30"
                placeholder="0.00"
                required
                disabled={submitting || !!success}
              />
              {(action === "withdraw" || action === "transfer") && (
                <p className="mt-2 text-[11px] text-white/50">Saldo disponible: {formatAmount(balance)} EUR</p>
              )}
            </div>
            {action === "transfer" && (
              <div>
                <label className="block text-sm font-medium mb-2 text-white/70">Correo destinatario *</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full h-12 rounded-lg bg-transparent border border-white/25 focus:border-[#8154ff] focus:ring-2 focus:ring-[#8154ff]/40 px-4 text-sm outline-none transition text-white placeholder:text-white/30"
                  placeholder="email@ejemplo.com"
                  required
                  disabled={submitting || !!success}
                />
              </div>
            )}
            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-md p-3">{error}</div>
            )}
            {success && (
              <div className="text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-md p-3">{success}</div>
            )}
            <div className="flex flex-col sm:flex-row gap-4 sm:justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-10 h-11 rounded-md text-sm font-medium tracking-wide border border-white/30 hover:border-white/50 bg-transparent text-white/90 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !!success}
                className="px-10 h-11 rounded-md text-sm font-medium tracking-wide border border-[#8154ff] bg-[#8154ff] hover:bg-[#905dff] text-white shadow shadow-[#8154ff]/40 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting && <Spinner />}
                {action === "withdraw" && "Retirar"}
                {action === "deposit" && "Depositar"}
                {action === "transfer" && "Enviar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* ------------------------------ Logic Helpers ----------------------------- */
// (legacy placeholder removed)


function truncateId(id: string, len = 8) {
  if (id.length <= len) return id;
  return id.slice(0, len) + "…";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator?.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="p-1 rounded hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#8154ff]/40"
      aria-label="Copiar ID"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      )}
    </button>
  );
}
