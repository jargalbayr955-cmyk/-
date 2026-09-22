import Link from 'next/link'

export function DriverAppLink() {
  return <Link href="/driver/app" className="driver-app-link">
    <span className="driver-app-link-icon" aria-hidden="true">↓</span>
    <span className="driver-app-link-copy">
      <strong>Жолоочийн апп татах</strong>
      <small>Android · Нэвтрэхгүйгээр татна</small>
    </span>
    <span aria-hidden="true">›</span>
  </Link>
}
