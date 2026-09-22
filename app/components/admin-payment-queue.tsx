'use client'

import { useState } from 'react'
import styles from './admin-payment-queue.module.css'

export type PendingDriverPayment = {
  id: string
  driver_id: string
  driver_name: string | null
  driver_phone: string | null
  car_number: string | null
  from_address: string | null
  to_address: string | null
  code: string
  amount: number | string
  fare_amount?: number | string | null
}

export function AdminPaymentQueue({ payments, approvingId, disabled, onApprove }: {
  payments: PendingDriverPayment[]
  approvingId: string | null
  disabled: boolean
  onApprove: (id: string) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  return <div>{payments.map(payment => <article key={payment.id} className={styles.card}>
        <div className={styles.row}>
          <div><strong>{payment.driver_name || 'Жолооч'}</strong>
            <p className={styles.plate}>Улсын дугаар: <strong>{payment.car_number || 'Бүртгээгүй'}</strong></p>
            <p className={styles.phone}>Утас: {payment.driver_phone || 'Бүртгээгүй'}</p>
          </div>
          <div><p className={styles.phone}>Шилжүүлэх шимтгэл</p><strong className={styles.amount}>{Number(payment.amount).toLocaleString('mn-MN')} ₮</strong></div>
        </div>
        {Number(payment.fare_amount) > 0 && <p className={styles.phone}>Тохиролцсон үнэ: {Number(payment.fare_amount).toLocaleString('mn-MN')} ₮ · Шимтгэл 5%</p>}
        <p className={styles.route}>{payment.from_address || 'Ачих газар'} → {payment.to_address || 'Хүргэх газар'}</p>
        <p className={styles.code}>Гүйлгээний утга: <strong>{payment.code}</strong></p>
        {confirming === `${payment.id}:${payment.code}:${payment.amount}` ? <div className={styles.confirmation} role="group" aria-label="Төлбөрийн зөвшөөрөл баталгаажуулах">
          <p><strong>{Number(payment.amount).toLocaleString('mn-MN')} ₮</strong> орлого <strong>{payment.code}</strong> гэсэн гүйлгээний утгатай орсныг шалгасан уу?</p>
          <p className={styles.note}>Энэ захиалгын шимтгэлийг төлөгдсөнд тооцно. Хүлээгдэж буй өөр төлбөр байвал жолоочийн эрх хаалттай хэвээр байна.</p>
          <div className={styles.searchRow}><button type="button" disabled={approvingId !== null} onClick={() => setConfirming(null)}>Болих</button><button type="button" disabled={disabled || approvingId !== null} onClick={() => onApprove(payment.id)}>{approvingId === payment.id ? 'Нээж байна…' : 'Орлогыг шалгасан · Эрх нээх'}</button></div>
        </div> : <button type="button" disabled={disabled || approvingId !== null} onClick={() => setConfirming(`${payment.id}:${payment.code}:${payment.amount}`)}>Энэ төлбөрийг зөвшөөрөх · Эрх нээх</button>}
      </article>)}</div>
}
