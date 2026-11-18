import { Link } from 'react-router-dom';

const COPY: Record<string, { title: string; body: string }> = {
  map: { title: 'แผนที่', body: 'แผนที่จุดรับ–ส่ง (กำลังพัฒนา) — ยังไม่ติดตามตำแหน่งแบบเรียลไทม์' },
  chat: { title: 'แชท', body: 'แชทของทริปนี้ (กำลังพัฒนา)' },
  history: {
    title: 'ประวัติทริป',
    body: 'ทริปที่คุณเคยร่วม · จ่ายผ่านพร้อมเพย์ · โอนกันเอง ไม่ผ่านแอป (กำลังพัฒนา)',
  },
  account: {
    title: 'บัญชี',
    body: 'โปรไฟล์ ที่อยู่ที่บันทึกไว้ ภาษา (กำลังพัฒนา)',
  },
  parcels: { title: 'ฝากส่งของ', body: 'พัสดุไปกับทริป (กำลังพัฒนา)' },
  donate: { title: 'สนับสนุนแอป', body: 'บริจาค (กำลังพัฒนา)' },
  features: { title: 'ฟีเจอร์และไอเดีย', body: 'กระดานไอเดีย (กำลังพัฒนา)' },
};

export function StubPage({ name }: { name: keyof typeof COPY }) {
  const c = COPY[name];
  return (
    <main className="page">
      <p>
        <Link to="/">← หน้าแรก</Link>
      </p>
      <h1 className="page-title">{c.title}</h1>
      <p className="lede" data-testid="stub">
        {c.body}
      </p>
    </main>
  );
}
