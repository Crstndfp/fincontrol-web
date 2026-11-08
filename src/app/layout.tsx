import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinControl — Plataforma Integral de Gestión y Control Financiero",
  description:
    "Auditoría bimonetaria (GTQ/USD), conciliación inteligente antiduplicidad, regla 50/30/20, simulador hipotecario y sincronización Android Express.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
