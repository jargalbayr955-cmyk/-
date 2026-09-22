import Link from 'next/link'

export default function DriverAppDownload() {
  return <main style={{minHeight:'100dvh', background:'#060608', color:'white', padding:'48px 24px'}}>
    <div style={{maxWidth:520, margin:'0 auto'}}>
      <p style={{color:'#ff8078', fontWeight:700}}>ANDROID · ТУРШИЛТЫН ХУВИЛБАР</p>
      <h1 style={{fontSize:32}}>Ачилт Жолооч</h1>
      <p style={{lineHeight:1.7, color:'#c4c4cc'}}>Ажиллаж байх үед дэлгэц түгжээтэй ч байршлаа илгээж, захиалгын мэдэгдэл авах зориулалттай апп.</p>
      <a href="/downloads/AchiltDriver-5.5.1-preview.apk" download style={{display:'block', textAlign:'center', background:'#e8433a', color:'white', padding:18, borderRadius:14, textDecoration:'none', fontWeight:700, margin:'24px 0'}}>Android апп татах · APK</a>
      <p style={{color:'#aaa', fontSize:14}}>Android 8 болон түүнээс дээш. iPhone-д суухгүй.</p>
      <ol style={{paddingLeft:24, lineHeight:1.9}}>
        <li>Татсан APK файлаа нээж суулгана. Энэ файлаас суулгах зөвшөөрөл асуувал зөвшөөрнө.</li>
        <li>Админы бүртгэсэн утас, PIN-ээр нэвтэрнэ.</li>
        <li>Профайлдаа машины төрлөө сонгоно.</li>
        <li>Дээд талын <strong>Ажиллаж эхлэх</strong> дарж байршил, мэдэгдлээ зөвшөөрнө.</li>
        <li><strong>GPS ажиллаж байна</strong> гэсэн төлөв гарсны дараа захиалга хүлээнэ.</li>
      </ol>
      <p style={{padding:16, background:'#242025', borderRadius:12, lineHeight:1.7}}>Энэ нь туршилтын APK. Бодит утсан дээр дэлгэц түгжээтэй GPS, мэдэгдэл, батарейн зарцуулалтыг баталгаажуулах шаардлагатай. Захиалгыг ойролцоогоор 20 секунд тутам шалгана; сүлжээ, утасны тохиргооноос хоцорч болно.</p>
      <p style={{lineHeight:1.7, color:'#c4c4cc'}}>Байршил илгээхийг <strong>Амарч эхлэх</strong> дарж зогсооно. <strong>⋮ → Гарах</strong> энэ төхөөрөмжийн нэвтрэлтийг цэвэрлэнэ. Утсаа дахин асаасан эсвэл аппыг хүчээр зогсоосон бол ажлаа дахин эхлүүлнэ.</p>
      <Link href="/driver" style={{color:'#ff8078'}}>← Жолоочийн сайт руу буцах</Link>
    </div>
  </main>
}
