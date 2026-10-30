import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Жолоочийн апп татах | Ачилт',
  description: 'Ачилт Жолооч Android аппыг татаж, суулгах болон үргэлж онлайн ажиллах тохиргооны заавар.',
}

export default function DriverAppDownload() {
  return <main style={{minHeight:'100dvh', background:'#060608', color:'white', padding:'48px 24px'}}>
    <div style={{maxWidth:520, margin:'0 auto'}}>
      <p style={{color:'#ff8078', fontWeight:700}}>ANDROID · ТУРШИЛТЫН ХУВИЛБАР</p>
      <h1 style={{fontSize:32}}>Ачилт Жолооч</h1>
      <p style={{lineHeight:1.7, color:'#c4c4cc'}}>Нэвтэрсэн жолооч автоматаар онлайн ажиллана. Дэлгэц түгжээтэй эсвэл өөр апп ашиглаж байх үед ч байршлаа шинэчилж, шинэ захиалгын мэдэгдэл авах зориулалттай.</p>
      <p style={{lineHeight:1.7, color:'#c4c4cc'}}>Апп дотроос жолоочоор бүртгүүлэх эсвэл бүртгэлтэй утас, PIN-ээр нэвтэрч болно. “Амрах / Онлайн болох” товч байхгүй.</p>
      <a href="/downloads/AchiltDriver-5.5.3-preview.apk" download style={{display:'block', textAlign:'center', background:'#e8433a', color:'white', padding:18, borderRadius:14, textDecoration:'none', fontWeight:700, margin:'24px 0'}}>Android апп татах · 5.5.3 · APK</a>
      <p style={{color:'#aaa', fontSize:14}}>Android 8 болон түүнээс дээш. iPhone-д суухгүй.</p>
      <p style={{lineHeight:1.7, color:'#c4c4cc'}}>Видео дуудлага ашиглах үед камер, микрофоны зөвшөөрөл тусад нь асууна. Байршил болон мэдэгдлийн зөвшөөрлийг Allow / Зөвшөөрөх болгосон байх шаардлагатай.</p>
      <ol style={{paddingLeft:24, lineHeight:1.9}}>
        <li>Татсан APK файлаа нээж суулгана. Энэ файлаас суулгах зөвшөөрөл асуувал зөвшөөрнө.</li>
        <li>Жолоочоор бүртгүүлэх эсвэл бүртгэлтэй утас, PIN-ээр нэвтэрнэ.</li>
        <li>Профайл, үйлчилгээний төрлөө бүрэн тохируулна.</li>
        <li>Байршил болон мэдэгдлийн зөвшөөрлийг <strong>Allow / Зөвшөөрөх</strong> болгоно.</li>
        <li><strong>● ОНЛАЙН АВТОМАТ</strong> болон <strong>GPS ажиллаж байна</strong> төлөв гарсны дараа апп захиалгыг автоматаар хүлээнэ.</li>
      </ol>
      <p style={{padding:16, background:'#242025', borderRadius:12, lineHeight:1.7}}>Энэ нь туршилтын APK. Захиалгыг ойролцоогоор 10 секунд тутам шалгана. Идэвхтэй захиалга эсвэл төлөгдөөгүй шимтгэлтэй үед шинэ захиалга давхар авахгүй ч GPS болон мэдэгдлийн үйлчилгээ ажилласаар байна.</p>
      <p style={{lineHeight:1.7, color:'#c4c4cc'}}>Гараар “Амрах” шаардлагагүй. Ажиллахаа бүрэн зогсоох бол <strong>⋮ → Гарах</strong> ашиглана. Утсаа дахин асаасан эсвэл аппыг Force stop хийсэн бол аппыг нэг удаа нээж нэвтрэлтийн төлөв, байршил, мэдэгдлээ шалгана.</p>
      <p style={{lineHeight:1.7, color:'#c4c4cc'}}>Апп дотор чат болон бусад дэд хэсэг рүү орсон үед утасны <strong>Back</strong> товч нэг нэг алхмаар буцаана; шууд апп-аас гаргахгүй.</p>
      <nav aria-label="Сайтын холбоос" style={{display:'flex', flexWrap:'wrap', gap:20, marginTop:24}}>
        <Link href="/driver" style={{color:'#ff8078', padding:'12px 0'}}>Жолоочоор нэвтрэх →</Link>
        <Link href="/" style={{color:'#c4c4cc', padding:'12px 0'}}>Нүүр хуудас</Link>
      </nav>
    </div>
  </main>
}
