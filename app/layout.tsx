import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "peneir.IA | Oportunidades que combinam com você",
  description:
    "Encontre editais, concursos, doutorados e bolsas. Organize seus documentos e receba alertas de novas oportunidades.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
