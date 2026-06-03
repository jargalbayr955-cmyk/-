import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ачилт",
  description: "Аварийн машин дуудах апп",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ачилт",
  },
  icons: {
    apple: "/icons/icon-180x180.png",
    icon: "/icons/icon-32x32.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#e8433a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mn">
      <head>
        <meta charSet="UTF-8" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-180x180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ачилт" />
      </head>
      <body style={{fontFamily: "Arial, sans-serif"}} className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
