'use client'

import styles from './admin-payment-queue.module.css'

export type PendingDriverPayment = {
  id: string
  driver_id: string
  driver_name: string | null
  driver_phone: string | null
  from_address: string | null
  to_address: string | null
  code: string
  amount: number | string
}

export function AdminPaymentQueue({ payments, total, approvingId, onApprove }: {
  payments: PendingDriverPayment[]
  total: number
  approvingId: string | null
  onApprove: (id: string) => void
}) {
  return <section className={styles.queue} aria-label="Жолоочийн эрх нээх">
    <h2 className={styles.heading}>Жолоочийн эрх нээх <span>{total}</span></h2>
    {payments.length === 0 ? <p className={styles.note}>Админы зөвшөөрөл хүлээсэн захиалга алга.</p> : <>
      <p className={styles.note}>Төлбөрийг шалгаад тухайн захиалгыг зөвшөөрнө үү.</p>
      {payments.map(payment => <article key={payment.id} className={styles.card}>
        <div className={styles.row}>
          <div><strong>{payment.driver_name || 'Жолооч'}</strong><p className={styles.phone}>{payment.driver_phone || 'Дугааргүй'}</p></div>
          <strong className={styles.amount}>{Number(payment.amount).toLocaleString('mn-MN')} ₮</strong>
        </div>
        <p className={styles.route}>{payment.from_address || 'Ачих газар'} → {payment.to_address || 'Хүргэх газар'}</p>
        <p className={styles.code}>Гүйлгээний утга: <strong>{payment.code}</strong></p>
        <button type="button" disabled={approvingId !== null} onClick={() => onApprove(payment.id)}>
          {approvingId === payment.id ? 'Зөвшөөрч байна…' : 'Зөвшөөрөх · Эрх нээх'}
        </button>
      </article>)}
      {total > payments.length && <p className={styles.note}>Эхний {payments.length} захиалга харагдаж байна. Зөвшөөрөхөд дараагийн захиалгууд гарч ирнэ.</p>}
    </>}
  </section>
}
