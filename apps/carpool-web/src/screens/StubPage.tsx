import { Link } from 'react-router-dom';

const COPY: Record<string, { title: string; body: string }> = {
  map: { title: 'แผนที่', body: 'แผนที่หมุดรับ-ส่ง (เฟสถัดไป) — ไม่ใช้ติดตามตำแหน่งสด' },
  chat: { title: 'กล่องข้อความ', body: 'กล่องแชททั้งทริป (เฟสถัดไป)' },
  history: {
    title: 'ประวัติทริป',
    body: 'ทริปที่คุณเคยร่วม · จ่ายผ่านพร้อมเพย์ · แพลตฟอร์มไม่ถือเงิน (เฟสถัดไป ตาม M-B18)',
  },
  account: {
    title: 'บัญชี',
    body: 'โปรไฟล์ ที่อยู่ที่บันทึก ภาษา (เฟสถัดไป ตาม M-B19)',
  },
  parcels: { title: 'ฝากส่งของ', body: 'พัสดุไปกับทริป (เฟสถัดไป) ตาม B15/B16' },
  donate: { title: 'สนับสนุนแพลตฟอร์ม', body: 'โดเนท (เฟสถัดไป) ตาม B08' },
  features: { title: 'ฟีเจอร์และไอเดีย', body: 'บอร์ดไอเดีย (เฟสถัดไป) ตาม B06' },
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
