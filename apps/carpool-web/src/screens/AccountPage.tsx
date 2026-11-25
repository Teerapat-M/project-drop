import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BANGKOK_CENTER, capStoredLabel } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { DEMO_ADDRESSES } from '../fixtures';
import { liters } from '../lib/format';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { PlaceField } from '../maps/PlaceField';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { AddressKind, SavedAddress, VehicleType } from '../types';

const KIND_LABEL: Record<AddressKind, string> = {
  home: 'บ้าน',
  work: 'ที่ทำงาน',
  custom: 'อื่นๆ',
};

export function AccountPage() {
  const { demo, user } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>(demo ? DEMO_ADDRESSES : []);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [car] = useState<{ icon: string; type: VehicleType; trunk: { w: number; h: number; l: number } }>({
    icon: 'sedan',
    type: 'sedan',
    trunk: { w: 100, h: 50, l: 50 },
  });

  useEffect(() => {
    if (demo) {
      setAddresses(DEMO_ADDRESSES);
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      setLoadError('ยังไม่ได้ตั้งค่า Supabase');
      return;
    }
    void supabase
      .from('carpool_saved_addresses')
      .select('id, owner_id, kind, label, address_text, lat, lng')
      .order('created_at')
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          setLoadError('โหลดที่อยู่ไม่สำเร็จ');
          setAddresses([]);
          return;
        }
        setLoadError(null);
        setAddresses((data as SavedAddress[]) ?? []);
      });
  }, [demo]);

  const save = async (row: SavedAddress) => {
    const capped: SavedAddress = {
      ...row,
      label: capStoredLabel(row.label),
      address_text: capStoredLabel(row.address_text),
    };
    setSaveError(null);
    if (demo) {
      setAddresses((prev) => {
        const i = prev.findIndex((a) => a.id === capped.id);
        if (i === -1) return [...prev, capped];
        return prev.map((a) => (a.id === capped.id ? capped : a));
      });
      setEditing(null);
      return;
    }
    const supabase = getSupabase();
    if (!supabase || !user) return;
    if (capped.id.startsWith('new-')) {
      const { data, error } = await supabase
        .from('carpool_saved_addresses')
        .insert({
          owner_id: user.id,
          kind: capped.kind,
          label: capped.label,
          address_text: capped.address_text,
          lat: capped.lat,
          lng: capped.lng,
        })
        .select('id, owner_id, kind, label, address_text, lat, lng')
        .single();
      if (error || !data) {
        setSaveError('บันทึกที่อยู่ไม่สำเร็จ');
        return;
      }
      setAddresses((prev) => [...prev, data as SavedAddress]);
    } else {
      const { error } = await supabase
        .from('carpool_saved_addresses')
        .update({
          kind: capped.kind,
          label: capped.label,
          address_text: capped.address_text,
          lat: capped.lat,
          lng: capped.lng,
        })
        .eq('id', capped.id);
      if (error) {
        setSaveError('บันทึกที่อยู่ไม่สำเร็จ');
        return;
      }
      setAddresses((prev) => prev.map((a) => (a.id === capped.id ? capped : a)));
    }
    setEditing(null);
  };

  const name = user?.user_metadata?.full_name ?? 'คุณ';

  return (
    <main className="page">
      <div className="page-head">
        <Link to="/" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">บัญชี</h1>
        <span className="page-head-spacer" />
      </div>

      <section className="card row" data-testid="account-profile">
        <div className="avatar" aria-hidden>
          {String(name).slice(0, 1)}
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{name}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {user?.email ?? (demo ? 'โหมดตัวอย่าง' : 'บัญชี Drop')}
          </p>
        </div>
      </section>

      <section className="card row" data-testid="account-car">
        <CarPhoto car_icon={car.icon} vehicle_type={car.type} />
        <div>
          <p style={{ margin: 0 }}>
            <strong>รถของฉัน</strong> (เมื่อเป็นคนขับ)
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {VEHICLE_LABEL[car.type]}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            ท้ายรถ {car.trunk.w}×{car.trunk.h}×{car.trunk.l} ซม. = {liters(car.trunk.w, car.trunk.h, car.trunk.l)} ล.
          </p>
        </div>
      </section>

      <section className="card">
        <p style={{ margin: 0 }}>
          <strong>ภาษา</strong>
        </p>
        <p className="muted" style={{ margin: 0 }}>
          ไทย · ใช้ภาษาตามโปรไฟล์
        </p>
      </section>

      <h2 style={{ fontSize: 16 }}>ที่อยู่ของฉัน</h2>
      {loading ? <p data-testid="address-loading">กำลังโหลดที่อยู่…</p> : null}
      {loadError ? (
        <p className="field-error" data-testid="address-load-error">
          {loadError}
        </p>
      ) : null}
      {saveError ? (
        <p className="field-error" data-testid="address-save-error">
          {saveError}
        </p>
      ) : null}
      {!loading && !loadError && addresses.length === 0 ? (
        <p className="empty muted" data-testid="address-empty">
          ยังไม่มีที่อยู่ที่บันทึกไว้
        </p>
      ) : null}
      <div className="stack">
        {addresses.map((a) => (
          <button
            key={a.id}
            type="button"
            className="card tap-target address-row"
            data-testid={`address-${a.kind}`}
            onClick={() => setEditing(a)}
          >
            <strong>
              {a.kind === 'home' ? (
                <img src="/assets/lucide-house.svg" alt="" width={20} height={20} />
              ) : a.kind === 'work' ? (
                <img src="/assets/lucide-briefcase.svg" alt="" width={20} height={20} />
              ) : null}{' '}
              {a.label || KIND_LABEL[a.kind]}
            </strong>
            <p className="muted" style={{ margin: 0 }}>
              {a.address_text}
            </p>
          </button>
        ))}
        <button
          type="button"
          className="btn ghost tap-target"
          data-testid="add-address"
          onClick={() =>
            setEditing({
              id: `new-${Date.now()}`,
              kind: 'custom',
              label: 'อื่นๆ',
              address_text: '',
              lat: BANGKOK_CENTER.lat,
              lng: BANGKOK_CENTER.lng,
            })
          }
        >
          เพิ่มที่อยู่
        </button>
      </div>

      {editing ? (
        <AddressEditor
          value={editing}
          onCancel={() => setEditing(null)}
          onSave={(row) => void save(row)}
        />
      ) : null}
    </main>
  );
}

function AddressEditor({
  value,
  onCancel,
  onSave,
}: {
  value: SavedAddress;
  onCancel: () => void;
  onSave: (row: SavedAddress) => void;
}) {
  const [row, setRow] = useState(value);
  return (
    <form
      className="card stack"
      data-testid="address-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(row);
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>เพิ่มหรือแก้ไขที่อยู่</h2>
      <div className="row">
        {(['home', 'work', 'custom'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`chip tap-target ${row.kind === k ? 'on' : ''}`}
            onClick={() => setRow((r) => ({ ...r, kind: k, label: KIND_LABEL[k] }))}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <PlaceField
        label="ค้นหาชื่อสถานที่"
        testId="address-place"
        value={
          row.address_text
            ? { lat: row.lat, lng: row.lng, address: row.address_text }
            : null
        }
        fallback={{ lat: row.lat, lng: row.lng, address: row.address_text }}
        placeholder="ชื่อสถานที่ หรือที่อยู่"
        onChange={(place) =>
          setRow((r) => ({
            ...r,
            address_text: place.address,
            lat: place.lat,
            lng: place.lng,
          }))
        }
      />
      <label className="field">
        บ้านเลขที่ / หมายเหตุ
        <input value={row.label} onChange={(e) => setRow((r) => ({ ...r, label: e.target.value }))} />
      </label>
      <div className="row">
        <button className="btn tap-target" type="submit">
          บันทึก
        </button>
        <button className="btn ghost tap-target" type="button" onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
