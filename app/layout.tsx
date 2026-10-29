import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { NavigationHistory } from './components/navigation-history';
import { TapHaptics } from './components/tap-haptics';
import { CustomerPresence } from './components/customer-presence';

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
      <body style={{fontFamily: "Arial, sans-serif"}} className="min-h-full flex flex-col"><NavigationHistory /><TapHaptics /><CustomerPresence />{children}</body>
    </html>
  );
}
