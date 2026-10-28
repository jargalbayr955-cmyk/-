import type { Metadata } from 'next'
import { DriverInstallButton } from '../components/driver-install-button'

export const metadata: Metadata = {
  title: 'Ачилт · Жолооч',
  description: 'Ачилт үйлчилгээний жолоочийн апп',
  manifest: '/driver-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ачилт Жолооч',
  },
  icons: {
    apple: '/icons/icon-180x180.png',
    icon: '/icons/icon-32x32.png',
  },
}

export default function DriverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}<DriverInstallButton /></>
}
