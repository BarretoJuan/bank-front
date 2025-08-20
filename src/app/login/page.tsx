"use client";
import { useState, useId, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import Image from "next/image";

// Password validation mirrors signup (>=8 chars & at least one number)
const passwordIsValid = (pwd: string) => /^(?=.*\d).{8,}$/.test(pwd);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitAttempt, setSubmitAttempt] = useState(false);

  const backend = process.env.NEXT_PUBLIC_BACK_URL;

  const schema = z.object({
    email: z.string().email("Email inválido"),
    password: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/\d/, "Debe incluir al menos un número"),
  });

  const validation = schema.safeParse({ email, password });
  const fieldErrors: Record<string, string[]> = validation.success
    ? {}
    : validation.error.flatten().fieldErrors;

  const canSubmit = validation.success && !loading;

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("accessToken");
    if (token) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempt(true);
    if (!backend) return;
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${backend}/auth/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Credenciales inválidas");
      }
      const accessToken = data?.accessToken || data?.access_token;
      const refreshToken = data?.refreshToken || data?.refresh_token;
      if (typeof window !== "undefined") {
        if (accessToken) localStorage.setItem("accessToken", accessToken);
        if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
      }
      setSuccess("Inicio de sesión exitoso");
      setTouched({ email: false, password: false });
      setSubmitAttempt(false);
      setPassword("");
  // Navigate to dashboard after a short delay so the success message can flash (optional)
  setTimeout(() => router.replace("/dashboard"), 300);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
  <div className="min-h-[calc(100vh-5rem)] w-full flex flex-col md:flex-row bg-[#0b0223] text-white font-sans">
      {/* Left visual panel (reuse same cover) */}
      <div className="w-full md:w-[55%] flex items-center justify-center px-4 py-10 md:py-6">
        <div className="relative max-w-[640px] aspect-[1/1] w-full hidden md:block">
          <div className="absolute inset-0 rounded-sm bg-gradient-to-br from-[#4e5fff] via-[#4e5fff] to-transparent p-[3px]">
            <div className="relative w-full h-full overflow-hidden">
              <Image
                src="/cover.jpg"
                alt="Arquitectura"
                fill
                priority
                className="object-cover grayscale brightness-[0.95]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-6 md:px-12 py-10 md:py-6">
        <div className="w-full max-w-md">
          <header className="mb-10 flex justify-center">
            <Image
              src="/logo.png"
              alt="Metlabs Logo"
              width={220}
              height={140}
              priority
            />
          </header>
          <form onSubmit={handleSubmit} className="space-y-6">
            <FloatingInput
              id="email"
              label="Correo electrónico"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="example@example.com"
              autoComplete="email"
              required
            />
            <PasswordInput
              id="password"
              label="Contraseña"
              value={password}
              onChange={(v) => setPassword(v)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              show={showPwd}
              toggle={() => setShowPwd((s) => !s)}
              invalid={!!password && !passwordIsValid(password)}
              helper="La contraseña debe tener al menos 8 caracteres y al menos 1 número."
            />

            <FieldError show={(touched.email || submitAttempt)} errors={fieldErrors.email} field="Correo" />
            <FieldError show={(touched.password || submitAttempt)} errors={fieldErrors.password} field="Contraseña" />

            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-md p-2">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-md p-2">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-11 rounded-md bg-[#8154ff] hover:bg-[#905dff] disabled:opacity-40 disabled:cursor-not-allowed transition font-medium text-sm shadow-sm shadow-[#8154ff]/40"
            >
              {loading ? "Iniciando..." : "Iniciar sesión"}
            </button>

            <p className="text-center text-xs text-white/70">
              ¿No tienes cuenta?{" "}
              <Link href="/sign-up" className="underline underline-offset-2 hover:text-purple-300">
                Regístrate
              </Link>
            </p>
          
          </form>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Reusable Sub Components (inline) ----------------------- */

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}
function FloatingInput({ label, id, className, ...rest }: FloatingInputProps) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className="relative group">
      <input
        id={inputId}
        className={`peer w-full h-11 rounded-md bg-transparent border border-white/25 focus:border-[#8154ff] focus:ring-2 focus:ring-[#8154ff]/40 px-4 text-sm outline-none transition placeholder:text-transparent text-white ${className || ""}`}
        placeholder={label}
        {...rest}
      />
      <label
        htmlFor={inputId}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-white/50 transition-all peer-focus:top-2.5 peer-focus:text-[11px] peer-focus:text-white/70 peer-not-placeholder-shown:top-2.5 peer-not-placeholder-shown:text-[11px] peer-not-placeholder-shown:text-white/70"
      >
        {label}
        {rest.required && <span className="text-[#8154ff]"> *</span>}
      </label>
    </div>
  );
}

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
  invalid?: boolean;
  helper?: string;
  onBlur?: () => void;
}
function PasswordInput({
  id,
  label,
  value,
  onChange,
  show,
  toggle,
  invalid,
  helper,
  onBlur,
}: PasswordInputProps) {
  return (
    <div className="space-y-1">
      <div className="relative group">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          required
          aria-invalid={invalid || undefined}
          className={`peer w-full h-11 rounded-md bg-transparent border px-4 pr-12 text-sm outline-none transition text-white placeholder:text-transparent border-white/25 focus:border-[#8154ff] focus:ring-2 focus:ring-[#8154ff]/40 ${invalid ? "border-red-400 focus:border-red-400 focus:ring-red-500/30" : ""}`}
          placeholder={label}
        />
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] transition-all text-white/50 peer-focus:top-2.5 peer-focus:text-[11px] peer-focus:text-white/70 peer-not-placeholder-shown:top-2.5 peer-not-placeholder-shown:text-[11px] peer-not-placeholder-shown:text-white/70 ${invalid ? "text-red-300 peer-focus:text-red-300" : ""}`}
        >
          {label} <span className="text-[#8154ff]">*</span>
        </label>
        <button
          type="button"
          onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {show ? <EyeClosedIcon className="w-5 h-5" /> : <EyeOpenIcon className="w-5 h-5" />}
        </button>
      </div>
      {helper && (
        <p className={`text-[11px] leading-snug ${invalid ? "text-red-400" : "text-white/55"}`}>
          {helper}
        </p>
      )}
    </div>
  );
}

function FieldError({ errors, field, show }: { errors?: string[]; field: string; show?: boolean }) {
  if (!show || !errors || errors.length === 0) return null;
  return (
    <div className="text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-2 py-1" aria-live="polite">
      <span className="sr-only">Error en {field}: </span>{errors[0]}
    </div>
  );
}

function EyeOpenIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}
function EyeClosedIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.5 5.5A9.77 9.77 0 0112 5c6.5 0 10 7 10 7a18.1 18.1 0 01-2.2 3.4m-4 3A11.62 11.62 0 0112 19c-6.5 0-10-7-10-7a18.49 18.49 0 013.1-4.6" />
    </svg>
  );
}
