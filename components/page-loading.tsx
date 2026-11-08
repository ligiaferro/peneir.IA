import { BrandMark } from "@/components/brand-mark";

/**
 * Esqueleto mostrado na hora do clique enquanto o servidor busca os dados da
 * página (usado pelos `loading.tsx`). Mantém o topo e a estrutura da página
 * para a troca não "pular".
 */
export function PageLoading({
  variant,
  label,
}: {
  variant: "grid" | "detail" | "two-columns" | "panels";
  label: string;
}) {
  return (
    <div className="shell" aria-busy="true">
      <header className="topbar">
        <span className="brand">
          <BrandMark />
          peneir.IA
        </span>
        <div className="top-actions">
          <span className="skeleton skeleton-chip" />
          <span className="skeleton skeleton-button" />
          <span className="skeleton skeleton-button" />
        </div>
      </header>
      <main className="main">
        <p className="sr-only" role="status">
          {label}
        </p>
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        {variant === "grid" && (
          <div className="opportunity-grid">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="skeleton skeleton-card" key={index} />
            ))}
          </div>
        )}
        {variant === "detail" && (
          <>
            <div className="skeleton skeleton-block" />
            <div className="skeleton skeleton-block skeleton-block-tall" />
          </>
        )}
        {variant === "two-columns" && (
          <div className="profile-layout">
            <div className="skeleton skeleton-block skeleton-block-tall" />
            <div className="skeleton skeleton-block skeleton-block-tall" />
          </div>
        )}
        {variant === "panels" &&
          Array.from({ length: 3 }, (_, index) => (
            <div className="skeleton skeleton-block" key={index} />
          ))}
      </main>
    </div>
  );
}
