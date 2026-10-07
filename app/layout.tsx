import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: "Jauge — Production GPL",
  description: "Suivi de production GPL : inventaires journaliers, bilans de stock, réservoirs et rendements.",
};

export const viewport: Viewport = { themeColor: "#e8ebe8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
