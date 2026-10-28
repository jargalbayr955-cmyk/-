import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ачилт',
  description: 'Ачилт үйлчилгээний нэвтрэх нүүр',
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

export default function StartLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>
}
