"use client";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Clases extra para el contenedor (p.ej. ancho). */
  className?: string;
  autoFocus?: boolean;
};

// Input de búsqueda con ícono de lupa y botón X para limpiar.
export default function SearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  className = "",
  autoFocus,
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#9aa4af]">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#dfe4e0] bg-white py-2.5 pl-9 pr-9 text-sm text-[#14352a] outline-none transition placeholder:text-[#a6b0a9] focus:border-[#2f8f4e] focus:ring-2 focus:ring-[#2f8f4e]/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#a6b0a9] transition-colors hover:text-[#45505e]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
