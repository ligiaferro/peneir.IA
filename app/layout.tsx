import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "peneir.IA | Oportunidades que combinam com você",
  description:
    "Encontre licitações abertas no PNCP. Organize seus documentos e receba alertas de novas oportunidades.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Extensões do navegador costumam incluir atributos no <html> antes de o
    // React carregar; isso só silencia diferenças nos atributos desta tag.
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
