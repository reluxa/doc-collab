import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { WS_TOKEN } from "@/lib/config";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/ui/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "doc-collab",
  description: "Collaborative document editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh flex flex-col antialiased">
        {/* Server-rendered config for the browser WS client. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__DOC_COLLAB_CONFIG=${JSON.stringify({ wsToken: WS_TOKEN })}`,
          }}
        />
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
