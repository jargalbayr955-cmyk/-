import Link from 'next/link'

const steps = [
  { icon: '📍', title: 'Байршлаа оруул', text: 'Хаанаас ачуулах, хаашаа хүргүүлэхээ оруулна.' },
  { icon: '💬', title: 'Үнэ санал ав', text: 'Ойр байгаа жолооч нар үнэ санал илгээнэ.' },
  { icon: '🚚', title: 'Жолоочоо сонго', text: 'Үнэ, зайг харьцуулаад өөрт тохирох жолоочоо сонгоно.' },
]

export default function IndexPage() {
  return (
    <main className="min-h-dvh bg-[#07090d] text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col overflow-hidden bg-[#07090d] shadow-2xl">
        <section className="relative overflow-hidden px-5 pb-8 pt-[calc(20px+env(safe-area-inset-top))]">
          <div className="pointer-events-none absolute -right-28 -top-24 h-72 w-72 rounded-full bg-red-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 top-44 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

          <header className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#ff655b] to-[#d92f27] text-lg font-black shadow-[0_10px_28px_rgba(239,71,61,.28)]">А</div>
              <div>
                <div className="text-[17px] font-black leading-none">АЧИЛТ</div>
                <div className="mt-1 text-[10px] font-bold tracking-[.16em] text-white/45">АВТО АЧИЛТЫН ҮЙЛЧИЛГЭЭ</div>
              </div>
            </div>
            <Link href="/start" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/80 transition active:scale-95">
              Нэвтрэх
            </Link>
          </header>

          <div className="relative z-10 mt-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[11px] font-black tracking-wide text-red-200">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              АЧИЛТ ХЭРЭГТЭЙ ЮУ?
            </div>
            <h1 className="mt-5 max-w-[580px] text-[clamp(38px,10vw,62px)] font-black leading-[.98] tracking-[-.045em]">
              Ачилтын машин хайж <span className="text-[#ff655b]">олон газар залгах хэрэггүй.</span>
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] leading-6 text-white/60">
              Нэг хүсэлт илгээ. Ойр байгаа жолооч нараас үнэ санал аваад өөрт тохирох жолоочоо сонго.
            </p>

            <Link
              href="/start"
              className="mt-7 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#ef473d] to-[#d92f27] px-5 text-[17px] font-black shadow-[0_18px_42px_rgba(239,71,61,.28)] transition active:scale-[.985]"
            >
              🚚 Ачилт захиалах <span aria-hidden>→</span>
            </Link>
            <div className="mt-3 text-center text-[11px] font-medium text-white/35">Байршлаа оруулж эхэлнэ</div>
          </div>
        </section>

        <section className="px-5 py-7">
          <div className="mb-5">
            <div className="text-[11px] font-black tracking-[.2em] text-[#ff857e]">3 АЛХАМ</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Яаж ажиллах вэ?</h2>
          </div>
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.title} className="flex gap-4 rounded-2xl border border-white/[.08] bg-white/[.035] p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[.07] text-2xl">{step.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black tracking-[.16em] text-white/35">0{index + 1}</div>
                  <div className="mt-1 text-[15px] font-black">{step.title}</div>
                  <p className="mt-1 text-[12px] leading-5 text-white/45">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 pb-7">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3 text-center">
              <div className="text-xl">📍</div>
              <div className="mt-2 text-xs font-black">Ойр жолооч</div>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3 text-center">
              <div className="text-xl">💰</div>
              <div className="mt-2 text-xs font-black">Үнэ харьцуулна</div>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3 text-center">
              <div className="text-xl">✅</div>
              <div className="mt-2 text-xs font-black">Өөрөө сонгоно</div>
            </div>
          </div>
        </section>

        <section className="mt-auto border-t border-white/[.07] bg-white/[.02] px-5 py-7 text-center">
          <h2 className="text-2xl font-black tracking-tight">Яг одоо ачилт хэрэгтэй юу?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/45">Утсаар олон газар асуухын оронд нэг хүсэлтээр жолооч нараас санал аваарай.</p>
          <Link
            href="/start"
            className="mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-5 text-[15px] font-black text-[#0b0d11] transition active:scale-[.985]"
          >
            Ачилт захиалах →
          </Link>
          <div className="mt-5 text-[10px] font-bold tracking-[.18em] text-white/25">АЧИЛТ · УЛААНБААТАР</div>
        </section>

        <div className="sticky bottom-0 z-20 border-t border-white/10 bg-[#07090d]/90 px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:hidden">
          <Link href="/start" className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#ef473d] text-[15px] font-black shadow-lg transition active:scale-[.985]">
            🚚 Ачилт захиалах
          </Link>
        </div>
      </div>
    </main>
  )
}
