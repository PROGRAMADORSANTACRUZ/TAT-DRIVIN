"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login, saveSession } from "@/lib/api";
export default function LoginPage() {
  const router = useRouter();
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cedula.trim() || !password) {
      setError("Ingresa tu cédula y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await login(cedula.trim(), password);
      saveSession(token, user);
      router.push("/");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Error inesperado. Intenta de nuevo.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 bg-[linear-gradient(155deg,#7bc24a_0%,#5fae38_36%,#3f7f27_72%,#28551a_100%)]">
      {/* Textura de líneas diagonales */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0px,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_11px)]" />

      {/* Marca de agua: hexágono + letras S y Z */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg
          className="h-[115vh] w-auto opacity-[0.10]"
          viewBox="0 0 400 400"
          fill="none"
        >
          <polygon
            points="200,20 350,110 350,290 200,380 50,290 50,110"
            stroke="#e2f4d3"
            strokeWidth="5"
          />
        </svg>
        <span className="absolute left-[7%] select-none font-serif text-[26vh] leading-none text-[#e2f4d3] opacity-[0.08]">
          S
        </span>
        <span className="absolute right-[7%] select-none font-serif text-[26vh] leading-none text-[#e2f4d3] opacity-[0.08]">
          Z
        </span>
      </div>

      {/* Tarjeta */}
      <div className="relative z-10 w-full max-w-md rounded-[28px] bg-[#f3f8ec] p-8 shadow-2xl shadow-black/30 sm:p-10">
        <div className="mb-5 flex justify-center">
          <LogoMark />
        </div>

        <h1 className="text-center font-serif text-3xl font-bold text-[#274d17]">
          Bienvenido
        </h1>
        <p className="mt-2 text-center text-sm text-[#4f6b45]">
          Ingresa tus credenciales para acceder al sistema.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 rounded-xl border border-[#c0392b]/25 bg-[#c0392b]/10 px-4 py-3 text-sm text-[#b3261e]"
          >
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
          <div>
            <label
              htmlFor="cedula"
              className="mb-1.5 block text-sm font-semibold text-[#274d17]"
            >
              Cédula
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#7fa568]">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="12" r="2" />
                  <path d="M14 10h4M14 14h3M5 16.5c.7-1.4 2.1-2 4-2s3.3.6 4 2" />
                </svg>
              </span>
              <input
                id="cedula"
                name="cedula"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                placeholder="Número de cédula"
                value={cedula}
                onChange={(e) => setCedula(e.target.value.replace(/\D/g, ""))}
                disabled={loading}
                className="w-full rounded-xl border border-[#d5e6c4] bg-[#f9fcf3] py-3 pl-11 pr-4 text-sm text-[#274d17] outline-none transition placeholder:text-[#a6bd93] focus:border-[#5fae38] focus:ring-2 focus:ring-[#5fae38]/25 disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-semibold text-[#274d17]"
            >
              Contraseña
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#7fa568]">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full rounded-xl border border-[#d5e6c4] bg-[#f9fcf3] py-3 pl-11 pr-11 text-sm text-[#274d17] outline-none transition placeholder:text-[#a6bd93] focus:border-[#5fae38] focus:ring-2 focus:ring-[#5fae38]/25 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#7fa568] transition-colors hover:text-[#4f9c2c]"
              >
                {showPassword ? (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4f9c2c] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3f8523] focus:ring-2 focus:ring-[#4f9c2c]/40 focus:ring-offset-2 focus:ring-offset-[#f3f8ec] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.37 0 0 5.37 0 12h4Z" />
              </svg>
            )}
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[#6b8556]">
          ¿Problemas para acceder? Contacta al administrador del sistema.
        </p>
      </div>
    </main>
  );
}

/**
 * Muestra el logo real desde `/logo.png`. Si el archivo aún no existe,
 * cae al emblema SVG de respaldo.
 * Para usar el logo oficial: guarda la imagen en `frontend/public/logo.png`.
 */
function LogoMark() {
  const [failed, setFailed] = useState(false);

  if (failed) return <FallbackEmblem />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Frigorífico Agropecuaria Santacruz"
      className="h-32 w-auto sm:h-36"
      onError={() => setFailed(true)}
    />
  );
}

function FallbackEmblem() {
  return (
    <svg width="72" height="82" viewBox="0 0 72 82" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7bc24a" />
          <stop offset="1" stopColor="#3f7f27" />
        </linearGradient>
      </defs>
      <path
        d="M36 2 66 12 66 40 C66 58 52 71 36 79 C20 71 6 58 6 40 L6 12 Z"
        fill="url(#leaf)"
      />
      <path
        d="M36 8 60 16.5 60 40 C60 54 49 65 36 72 C23 65 12 54 12 40 L12 16.5 Z"
        fill="#28551a"
      />
      {/* Toro estilizado */}
      <g fill="#f3f8ec">
        <path d="M22 21 c-2 -3 -6 -4 -6 -1 c0 3 3 5 5 6 c-2 3 -1 8 3 10 c3 2 9 2 12 0 c4 -2 5 -7 3 -10 c2 -1 5 -3 5 -6 c0 -3 -4 -2 -6 1 c-3 -2 -8 -2 -11 0 c-1 -1 -2 -1 -3 0 Z" />
        <circle cx="30" cy="30" r="1.4" fill="#28551a" />
        <circle cx="36" cy="30" r="1.4" fill="#28551a" />
      </g>
      {/* Banner */}
      <rect x="9" y="45" width="54" height="13" rx="2.5" fill="#4f9c2c" />
      <text
        x="36"
        y="54.5"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="8"
        fontWeight="700"
        fill="#f3f8ec"
      >
        Santacruz
      </text>
    </svg>
  );
}
