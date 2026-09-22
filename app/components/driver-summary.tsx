'use client'

import { useState } from 'react'
import { offerDistance, offerPrice } from '@/lib/order-offers'

export function DriverSummary({ name, photo, plate, carType, price, distance }: {
  name: string | null; photo?: string | null; plate?: string | null; carType?: string | null
  price: number | null; distance: number | null
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
  const image = photo?.startsWith('https://') && photo !== failedPhoto ? photo : null
  return <div className="driver-summary">
    <div className="driver-summary-identity">
      <div className="driver-summary-photo">
        {image ? /* User-uploaded photo; no image proxy or remote host allowlist needed. */
          <img src={image} alt={`${name || 'Жолооч'}ийн зураг`} referrerPolicy="no-referrer" onError={() => setFailedPhoto(image)} />
          : <span aria-label="Жолооч зураг оруулаагүй">{name?.trim().slice(0, 1) || '🚛'}</span>}
      </div>
      <div><strong>{name || 'Жолооч'}</strong><span>{carType === 'butten' ? 'Бүтэн ачигч' : carType === 'chiregch' ? 'Чирэгч' : 'Ачигч'}</span><b className="driver-plate">{plate || 'Улсын дугаар оруулаагүй'}</b></div>
    </div>
    <div className="driver-summary-quote"><div><span>Үнийн санал</span><b>{price != null ? offerPrice(price) : 'Үнэ тодорхойгүй'}</b></div><div><strong>{offerDistance(distance)}</strong><span>Шулуун зайгаар</span></div></div>
  </div>
}
