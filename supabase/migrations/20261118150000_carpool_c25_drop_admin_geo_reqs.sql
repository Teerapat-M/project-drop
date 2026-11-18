-- เพื่อนร่วมทาง C2.5: drop province/district requirements, nearby-point
-- search, Javis PR #13 LOWs (cancelled/completed cap skip + trip-row lock).
-- NEW FILE. Do not edit 20261118100000 / 20261118120000 / 20261118130000 /
-- 20261118140000 or any earlier migration (those are already applied remotely).
-- Do not apply this to any remote DB from CI. CI applies it only to
-- ephemeral Postgres (supabase/tests/run-carpool-rls.sh).
-- NOT applied to the live project.
--
-- CHECKs: DROP the L2 pairing CHECKs (district must belong to its province,
-- and district-without-province). KEEP the format CHECKs
-- (^[0-9]{2}$ / ^[0-9]{4}$) on non-null values so old clients that still
-- send codes keep working. Columns stay (never dropped) and are nullable.
--
-- Discover: DROP + CREATE. Province/district params stay in the signature
-- with NULL defaults (accepted, ignored) so old clients keep working.
-- New optional nearby-point params. Vertex haversine (not segment) on
-- coords rounded to 3 decimals; returned km snapped to 0.5.
-- extra_km dest component + taxi exclude use carpool_detour_floor_km
-- (same as book_seat). Lat/lng NaN/out-of-range raises Thai. Radius 1–30.
-- Lock order for trip+seat: trip FOR UPDATE first, then seat
-- (cancel_booking, claim_owner_seat, set_seat_open, refresh_status,
-- book_seat). Do not lock the trip from seats_guard.
--
-- L3 LOW (a): skip the cap-lowering floor check when the trip itself is
-- cancelled or completed. Remaining bookings on an open/full/in_progress
-- trip still pin the cap. Cancel of a booking is DELETE (carpool_cancel_booking);
-- trip status values: open, full, in_progress, completed, cancelled.
--
-- L3 LOW (b): serialize booking vs cap-lowering.
--   * carpool_book_seat: SELECT the trip row FOR UPDATE before cap/insert.
--   * trips_guard cap path: the UPDATE already holds the row lock; no extra
--     SELECT FOR UPDATE (BEFORE UPDATE runs after the row lock).
--   * bookings_guard dest_* (and insert) path: lock the trip FOR UPDATE
--     before private.carpool_enforce_max_detour so a concurrent cap lower
--     cannot slip between the floor check and the write.
--
-- Privacy offset: true coords stay on carpool_trips. Non-owners read via
-- DEFINER RPCs (discover/preview/visible_trips) that apply a ~1 km offset
-- (bearing+km stored once in private.carpool_trip_offset; regen only when
-- that true point moves more than ~200 m haversine). Pickup/origin always
-- offset for non-owners. Dest offset only when hide_dest. Fare / detour
-- floor / book_seat keep the true route. Discover proximity uses the
-- offset vertices, then 3-dec + 0.5 km. Residual: listed pickup can be
-- ~1 km from the true origin book_seat does not check; taxi dest-floor
-- exclude still uses the true floor so common book_seat rejections are
-- not listed.
-- Reveal: in_progress exists in the enum/guards but carpool-web never
-- sets it. Booked riders get the true pickup 30 min before depart_at or
-- once status is in_progress/completed.
-- Coarse labels (non-owners): 77-province ALLOWLIST. Last comma-separated
-- part, after dropping a trailing country-only part (Thailand /
-- ประเทศไทย / ไทย) and a trailing 5-digit ASCII postcode, is matched
-- (NFC, strip Cf, trim, collapse spaces, case-fold, strip จ./จังหวัด
-- prefix and Province/Changwat suffix) against hand-written aliases.
-- Hit → canonical Thai province name (never input text). Miss, empty,
-- remaining \p{N} digit, or a single-part label → พื้นที่ใกล้เคียง.
-- Same function for discover/preview/visible_trips/booked-before-reveal.
--
-- M3 dest change: riders call public.carpool_set_booking_dest (helper in
-- private). Lock trip FOR UPDATE, then the booking. Direct UPDATE of
-- dest_* is revoked so PostgREST cannot lock booking then trip (that
-- deadlocked with cancel_booking: trip → seat → DELETE booking).
-- M6: also revoke luggage/updated_at UPDATE. Luggage is only set in
-- book_seat; carpool-web has no post-booking luggage editor.
-- Lock order for trip+seat+booking: trip, then seat, then booking.

-- ---------------------------------------------------------------------------
-- Geo columns: already nullable from 20261118130000. Drop pairing CHECKs.
-- Keep format CHECKs. Never drop the columns.
-- ---------------------------------------------------------------------------
alter table public.carpool_trips
  alter column origin_province_code drop not null,
  alter column dest_province_code drop not null,
  alter column origin_district_code drop not null,
  alter column dest_district_code drop not null;

alter table public.carpool_trips
  drop constraint if exists carpool_trips_origin_district_matches_province;
alter table public.carpool_trips
  drop constraint if exists carpool_trips_dest_district_matches_province;

alter table public.carpool_trips
  add column if not exists hide_dest boolean not null default false;

comment on column public.carpool_trips.hide_dest is
  'Opt-in: also offset the destination for non-owners. Default false (pickup/origin only). UI label: ซ่อนตำแหน่งปลายทางจริง.';

-- ---------------------------------------------------------------------------
-- Route vertices + nearby-point match. Point-to-vertex haversine.
-- Helpers live in private, search_path '', no EXECUTE for clients.
-- ---------------------------------------------------------------------------
-- M1: round every search coordinate to 3 decimals (~111 m) before
-- haversine so returned distances cannot trilaterate stored points
-- (often an owner's home) to meter-level. Returned km are then snapped
-- to 0.5 km. L3: no GiST/sp-gist spatial index for now (PostGIS is not
-- enabled); bbox + vertex scan only.
-- TODO: add a spatial index (or grid prefilter) if discover volume needs it.

create or replace function private.carpool_round_deg(p double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p is null then null
    else pg_catalog.round(p::numeric, 3)::double precision
  end;
$$;

revoke all on function private.carpool_round_deg(double precision) from public, anon, authenticated;

create or replace function private.carpool_round_km_half(p numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p is null then null
    else pg_catalog.round(p * 2) / 2
  end;
$$;

revoke all on function private.carpool_round_km_half(numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Creator-point privacy: ~1 km offset, random bearing stored once in private.
-- True coords stay on carpool_trips (fare / detour / book_seat / owner).
-- Non-owners read only via DEFINER RPCs that apply the offset.
-- ---------------------------------------------------------------------------
create table if not exists private.carpool_trip_offset (
  trip_id uuid primary key references public.carpool_trips (id) on delete cascade,
  pickup_bearing_rad double precision not null,
  pickup_km numeric not null
    constraint carpool_trip_offset_pickup_km check (pickup_km between 0.9 and 1.1),
  dest_bearing_rad double precision not null,
  dest_km numeric not null
    constraint carpool_trip_offset_dest_km check (dest_km between 0.9 and 1.1),
  pickup_src_lat double precision not null,
  pickup_src_lng double precision not null,
  dest_src_lat double precision not null,
  dest_src_lng double precision not null
);

revoke all on table private.carpool_trip_offset from public, anon, authenticated;
alter table private.carpool_trip_offset enable row level security;
comment on table private.carpool_trip_offset is
  'Per-trip random bearing+km (0.9–1.1). Regenerated only when that true point moves more than ~200 m. Never granted to clients.';

create or replace function private.carpool_offset_point(
  p_lat double precision,
  p_lng double precision,
  p_bearing_rad double precision,
  p_km numeric
)
returns table (lat double precision, lng double precision)
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    pg_catalog.degrees(pg_catalog.asin(
      pg_catalog.sin(pg_catalog.radians(p_lat)) * pg_catalog.cos(p_km / 6371.0)
      + pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.sin(p_km / 6371.0)
        * pg_catalog.cos(p_bearing_rad)
    )),
    ((pg_catalog.degrees(pg_catalog.radians(p_lng) + pg_catalog.atan2(
        pg_catalog.sin(p_bearing_rad) * pg_catalog.sin(p_km / 6371.0)
          * pg_catalog.cos(pg_catalog.radians(p_lat)),
        pg_catalog.cos(p_km / 6371.0)
          - pg_catalog.sin(pg_catalog.radians(p_lat)) * pg_catalog.sin(
              pg_catalog.asin(
                pg_catalog.sin(pg_catalog.radians(p_lat)) * pg_catalog.cos(p_km / 6371.0)
                + pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.sin(p_km / 6371.0)
                  * pg_catalog.cos(p_bearing_rad)
              )
            )
      )) + 540)::numeric % 360) - 180;
$$;

revoke all on function private.carpool_offset_point(
  double precision, double precision, double precision, numeric
) from public, anon, authenticated;

drop function if exists private.carpool_coarse_area_part(text);

-- Postgres ARE has no \p{N}/\p{Cf}. NFKC turns fullwidth/circled/superscript
-- digits into ASCII; Thai ๐-๙ stay; Roman/enclosed ranges cover the rest.
create or replace function private.carpool_text_has_number(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(normalize(p_text, nfkc), '') ~ '[0-9๐-๙０-９٠-٩۰-۹]'
      or coalesce(p_text, '') ~ U&'[\00B2-\00B3\00B9\00BC-\00BE\2070-\2079\2080-\2089\2150-\2188\2460-\24FF\2776-\2793\FF10-\FF19]';
$$;

revoke all on function private.carpool_text_has_number(text) from public, anon, authenticated;

-- Strip Unicode Cf (ZWSP/ZWNJ/ZWJ/word-joiner/BOM and related format chars).
create or replace function private.carpool_strip_format(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        normalize(coalesce(p_text, ''), nfc),
        U&'[\00AD\200B-\200F\202A-\202E\2060-\206F\FEFF]',
        '',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function private.carpool_strip_format(text) from public, anon, authenticated;

-- NFC, strip Cf, collapse spaces, case-fold, strip จ./จังหวัด prefix and
-- Province/Changwat suffix.
create or replace function private.carpool_norm_province_key(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(private.carpool_strip_format(p_text)),
        '^(จังหวัด|จ\.)[[:space:]]*',
        ''
      ),
      '[[:space:]]+(province|changwat)$',
      ''
    )
  );
$$;

revoke all on function private.carpool_norm_province_key(text) from public, anon, authenticated;

-- Hand-written 77-province allowlist (canonical Thai + aliases). Not a
-- bundled geo dataset; no credit line.
create or replace function private.carpool_province_pairs()
returns table(alias text, canonical text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('กรุงเทพมหานคร', 'กรุงเทพมหานคร'),
    ('กรุงเทพฯ', 'กรุงเทพมหานคร'),
    ('กรุงเทพ', 'กรุงเทพมหานคร'),
    ('กทม.', 'กรุงเทพมหานคร'),
    ('กทม', 'กรุงเทพมหานคร'),
    ('Bangkok', 'กรุงเทพมหานคร'),
    ('Bangkok Metropolis', 'กรุงเทพมหานคร'),
    ('Krung Thep Maha Nakhon', 'กรุงเทพมหานคร'),
    ('Krung Thep', 'กรุงเทพมหานคร'),
    ('Krungthep', 'กรุงเทพมหานคร'),
    ('กระบี่', 'กระบี่'),
    ('Krabi', 'กระบี่'),
    ('กาญจนบุรี', 'กาญจนบุรี'),
    ('Kanchanaburi', 'กาญจนบุรี'),
    ('กาฬสินธุ์', 'กาฬสินธุ์'),
    ('Kalasin', 'กาฬสินธุ์'),
    ('กำแพงเพชร', 'กำแพงเพชร'),
    ('Kamphaeng Phet', 'กำแพงเพชร'),
    ('Kamphaengphet', 'กำแพงเพชร'),
    ('Kampangpetch', 'กำแพงเพชร'),
    ('ขอนแก่น', 'ขอนแก่น'),
    ('Khon Kaen', 'ขอนแก่น'),
    ('Khonkaen', 'ขอนแก่น'),
    ('จันทบุรี', 'จันทบุรี'),
    ('Chanthaburi', 'จันทบุรี'),
    ('Chantaburi', 'จันทบุรี'),
    ('ฉะเชิงเทรา', 'ฉะเชิงเทรา'),
    ('Chachoengsao', 'ฉะเชิงเทรา'),
    ('Chachoeng Sao', 'ฉะเชิงเทรา'),
    ('ชลบุรี', 'ชลบุรี'),
    ('Chon Buri', 'ชลบุรี'),
    ('Chonburi', 'ชลบุรี'),
    ('ชัยนาท', 'ชัยนาท'),
    ('Chai Nat', 'ชัยนาท'),
    ('Chainat', 'ชัยนาท'),
    ('ชัยภูมิ', 'ชัยภูมิ'),
    ('Chaiyaphum', 'ชัยภูมิ'),
    ('ชุมพร', 'ชุมพร'),
    ('Chumphon', 'ชุมพร'),
    ('เชียงราย', 'เชียงราย'),
    ('Chiang Rai', 'เชียงราย'),
    ('Chiangrai', 'เชียงราย'),
    ('เชียงใหม่', 'เชียงใหม่'),
    ('Chiang Mai', 'เชียงใหม่'),
    ('Chiangmai', 'เชียงใหม่'),
    ('ตรัง', 'ตรัง'),
    ('Trang', 'ตรัง'),
    ('ตราด', 'ตราด'),
    ('Trat', 'ตราด'),
    ('ตาก', 'ตาก'),
    ('Tak', 'ตาก'),
    ('นครนายก', 'นครนายก'),
    ('Nakhon Nayok', 'นครนายก'),
    ('Nakhonnayok', 'นครนายก'),
    ('นครปฐม', 'นครปฐม'),
    ('Nakhon Pathom', 'นครปฐม'),
    ('Nakhonpathom', 'นครปฐม'),
    ('นครพนม', 'นครพนม'),
    ('Nakhon Phanom', 'นครพนม'),
    ('Nakhonphanom', 'นครพนม'),
    ('นครราชสีมา', 'นครราชสีมา'),
    ('Nakhon Ratchasima', 'นครราชสีมา'),
    ('Nakhonratchasima', 'นครราชสีมา'),
    ('Khorat', 'นครราชสีมา'),
    ('Korat', 'นครราชสีมา'),
    ('นครศรีธรรมราช', 'นครศรีธรรมราช'),
    ('Nakhon Si Thammarat', 'นครศรีธรรมราช'),
    ('Nakhonsithammarat', 'นครศรีธรรมราช'),
    ('นครสวรรค์', 'นครสวรรค์'),
    ('Nakhon Sawan', 'นครสวรรค์'),
    ('Nakhonsawan', 'นครสวรรค์'),
    ('นนทบุรี', 'นนทบุรี'),
    ('Nonthaburi', 'นนทบุรี'),
    ('นราธิวาส', 'นราธิวาส'),
    ('Narathiwat', 'นราธิวาส'),
    ('น่าน', 'น่าน'),
    ('Nan', 'น่าน'),
    ('บึงกาฬ', 'บึงกาฬ'),
    ('Bueng Kan', 'บึงกาฬ'),
    ('Buengkan', 'บึงกาฬ'),
    ('Bungkan', 'บึงกาฬ'),
    ('บุรีรัมย์', 'บุรีรัมย์'),
    ('Buri Ram', 'บุรีรัมย์'),
    ('Buriram', 'บุรีรัมย์'),
    ('ปทุมธานี', 'ปทุมธานี'),
    ('Pathum Thani', 'ปทุมธานี'),
    ('Pathumthani', 'ปทุมธานี'),
    ('ประจวบคีรีขันธ์', 'ประจวบคีรีขันธ์'),
    ('Prachuap Khiri Khan', 'ประจวบคีรีขันธ์'),
    ('Prachuapkhirikhan', 'ประจวบคีรีขันธ์'),
    ('ปราจีนบุรี', 'ปราจีนบุรี'),
    ('Prachin Buri', 'ปราจีนบุรี'),
    ('Prachinburi', 'ปราจีนบุรี'),
    ('ปัตตานี', 'ปัตตานี'),
    ('Pattani', 'ปัตตานี'),
    ('พระนครศรีอยุธยา', 'พระนครศรีอยุธยา'),
    ('อยุธยา', 'พระนครศรีอยุธยา'),
    ('Ayutthaya', 'พระนครศรีอยุธยา'),
    ('Phra Nakhon Si Ayutthaya', 'พระนครศรีอยุธยา'),
    ('Phra Nakhon Si Ayudhya', 'พระนครศรีอยุธยา'),
    ('Ayudhya', 'พระนครศรีอยุธยา'),
    ('พังงา', 'พังงา'),
    ('Phangnga', 'พังงา'),
    ('Phang Nga', 'พังงา'),
    ('Phang-nga', 'พังงา'),
    ('พัทลุง', 'พัทลุง'),
    ('Phatthalung', 'พัทลุง'),
    ('Phattalung', 'พัทลุง'),
    ('พิจิตร', 'พิจิตร'),
    ('Phichit', 'พิจิตร'),
    ('พิษณุโลก', 'พิษณุโลก'),
    ('Phitsanulok', 'พิษณุโลก'),
    ('เพชรบุรี', 'เพชรบุรี'),
    ('Phetchaburi', 'เพชรบุรี'),
    ('Petchaburi', 'เพชรบุรี'),
    ('เพชรบูรณ์', 'เพชรบูรณ์'),
    ('Phetchabun', 'เพชรบูรณ์'),
    ('Petchabun', 'เพชรบูรณ์'),
    ('แพร่', 'แพร่'),
    ('Phrae', 'แพร่'),
    ('พะเยา', 'พะเยา'),
    ('Phayao', 'พะเยา'),
    ('ภูเก็ต', 'ภูเก็ต'),
    ('Phuket', 'ภูเก็ต'),
    ('มหาสารคาม', 'มหาสารคาม'),
    ('Maha Sarakham', 'มหาสารคาม'),
    ('Mahasarakham', 'มหาสารคาม'),
    ('มุกดาหาร', 'มุกดาหาร'),
    ('Mukdahan', 'มุกดาหาร'),
    ('แม่ฮ่องสอน', 'แม่ฮ่องสอน'),
    ('Mae Hong Son', 'แม่ฮ่องสอน'),
    ('Maehongson', 'แม่ฮ่องสอน'),
    ('ยโสธร', 'ยโสธร'),
    ('Yasothon', 'ยโสธร'),
    ('ยะลา', 'ยะลา'),
    ('Yala', 'ยะลา'),
    ('ร้อยเอ็ด', 'ร้อยเอ็ด'),
    ('Roi Et', 'ร้อยเอ็ด'),
    ('Roiet', 'ร้อยเอ็ด'),
    ('ระนอง', 'ระนอง'),
    ('Ranong', 'ระนอง'),
    ('ระยอง', 'ระยอง'),
    ('Rayong', 'ระยอง'),
    ('ราชบุรี', 'ราชบุรี'),
    ('Ratchaburi', 'ราชบุรี'),
    ('ลพบุรี', 'ลพบุรี'),
    ('Lopburi', 'ลพบุรี'),
    ('Lop Buri', 'ลพบุรี'),
    ('ลำปาง', 'ลำปาง'),
    ('Lampang', 'ลำปาง'),
    ('ลำพูน', 'ลำพูน'),
    ('Lamphun', 'ลำพูน'),
    ('เลย', 'เลย'),
    ('Loei', 'เลย'),
    ('ศรีสะเกษ', 'ศรีสะเกษ'),
    ('Si Sa Ket', 'ศรีสะเกษ'),
    ('Sisaket', 'ศรีสะเกษ'),
    ('Sri Saket', 'ศรีสะเกษ'),
    ('สกลนคร', 'สกลนคร'),
    ('Sakon Nakhon', 'สกลนคร'),
    ('Sakonnakhon', 'สกลนคร'),
    ('สงขลา', 'สงขลา'),
    ('Songkhla', 'สงขลา'),
    ('สตูล', 'สตูล'),
    ('Satun', 'สตูล'),
    ('สมุทรปราการ', 'สมุทรปราการ'),
    ('Samut Prakan', 'สมุทรปราการ'),
    ('Samut Prakarn', 'สมุทรปราการ'),
    ('Samutprakan', 'สมุทรปราการ'),
    ('Samutprakarn', 'สมุทรปราการ'),
    ('สมุทรสงคราม', 'สมุทรสงคราม'),
    ('Samut Songkhram', 'สมุทรสงคราม'),
    ('Samutsongkhram', 'สมุทรสงคราม'),
    ('สมุทรสาคร', 'สมุทรสาคร'),
    ('Samut Sakhon', 'สมุทรสาคร'),
    ('Samutsakhon', 'สมุทรสาคร'),
    ('สระแก้ว', 'สระแก้ว'),
    ('Sa Kaeo', 'สระแก้ว'),
    ('Sakaeo', 'สระแก้ว'),
    ('Sa Kaew', 'สระแก้ว'),
    ('สระบุรี', 'สระบุรี'),
    ('Saraburi', 'สระบุรี'),
    ('สิงห์บุรี', 'สิงห์บุรี'),
    ('Sing Buri', 'สิงห์บุรี'),
    ('Singburi', 'สิงห์บุรี'),
    ('สุโขทัย', 'สุโขทัย'),
    ('Sukhothai', 'สุโขทัย'),
    ('สุพรรณบุรี', 'สุพรรณบุรี'),
    ('Suphan Buri', 'สุพรรณบุรี'),
    ('Suphanburi', 'สุพรรณบุรี'),
    ('สุราษฎร์ธานี', 'สุราษฎร์ธานี'),
    ('Surat Thani', 'สุราษฎร์ธานี'),
    ('Suratthani', 'สุราษฎร์ธานี'),
    ('สุรินทร์', 'สุรินทร์'),
    ('Surin', 'สุรินทร์'),
    ('หนองคาย', 'หนองคาย'),
    ('Nong Khai', 'หนองคาย'),
    ('Nongkhai', 'หนองคาย'),
    ('หนองบัวลำภู', 'หนองบัวลำภู'),
    ('Nong Bua Lam Phu', 'หนองบัวลำภู'),
    ('Nongbualamphu', 'หนองบัวลำภู'),
    ('Nong Bua Lamphu', 'หนองบัวลำภู'),
    ('อ่างทอง', 'อ่างทอง'),
    ('Ang Thong', 'อ่างทอง'),
    ('Angthong', 'อ่างทอง'),
    ('อำนาจเจริญ', 'อำนาจเจริญ'),
    ('Amnat Charoen', 'อำนาจเจริญ'),
    ('Amnatcharoen', 'อำนาจเจริญ'),
    ('อุดรธานี', 'อุดรธานี'),
    ('Udon Thani', 'อุดรธานี'),
    ('Udonthani', 'อุดรธานี'),
    ('Udorn Thani', 'อุดรธานี'),
    ('อุตรดิตถ์', 'อุตรดิตถ์'),
    ('Uttaradit', 'อุตรดิตถ์'),
    ('อุทัยธานี', 'อุทัยธานี'),
    ('Uthai Thani', 'อุทัยธานี'),
    ('Uthaithani', 'อุทัยธานี'),
    ('อุบลราชธานี', 'อุบลราชธานี'),
    ('Ubon Ratchathani', 'อุบลราชธานี'),
    ('Ubonratchathani', 'อุบลราชธานี')
  ) as v(alias, canonical);
$$;

revoke all on function private.carpool_province_pairs() from public, anon, authenticated;

create or replace function private.carpool_lookup_province(p_part text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p.canonical
    from private.carpool_province_pairs() p
   where private.carpool_norm_province_key(p.alias)
         = private.carpool_norm_province_key(p_part)
   limit 1;
$$;

revoke all on function private.carpool_lookup_province(text) from public, anon, authenticated;

-- Allowlist: canonical Thai province for the last comma-separated part.
-- Google formatted addresses usually end with ", Thailand" / ", ประเทศไทย"
-- and a postcode (e.g. "..., Bangkok 10110, Thailand" or
-- "... กรุงเทพมหานคร 10110"). Drop a trailing country-only part and a
-- trailing 5-digit ASCII postcode token before matching. Output is always
-- the canonical allowlisted name, never input text. No comma, empty, any
-- remaining \p{N} digit, or a non-province last part → พื้นที่ใกล้เคียง.
create or replace function private.carpool_coarse_label(p_address text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text := private.carpool_strip_format(p_address);
  parts text[];
  n int;
  last_part text;
  key text;
  canon text;
begin
  if raw = '' or pg_catalog.strpos(raw, ',') = 0 then
    return 'พื้นที่ใกล้เคียง';
  end if;
  parts := pg_catalog.regexp_split_to_array(raw, '\s*,\s*');
  n := pg_catalog.cardinality(parts);
  while n > 0 loop
    last_part := pg_catalog.btrim(parts[n]);
    key := pg_catalog.lower(private.carpool_strip_format(last_part));
    exit when key not in ('thailand', 'ประเทศไทย', 'ไทย');
    n := n - 1;
  end loop;
  if n < 1 then
    return 'พื้นที่ใกล้เคียง';
  end if;
  last_part := pg_catalog.btrim(parts[n]);
  last_part := pg_catalog.regexp_replace(last_part, '[[:space:]]+[0-9]{5}$', '');
  last_part := pg_catalog.btrim(last_part);
  if last_part = '' or private.carpool_text_has_number(last_part) then
    return 'พื้นที่ใกล้เคียง';
  end if;
  canon := private.carpool_lookup_province(last_part);
  if canon is null then
    return 'พื้นที่ใกล้เคียง';
  end if;
  return canon;
end;
$$;

revoke all on function private.carpool_coarse_label(text) from public, anon, authenticated;

create or replace function private.carpool_ensure_trip_offset(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.carpool_trips%rowtype;
  o private.carpool_trip_offset%rowtype;
  p_br double precision;
  d_br double precision;
  p_km numeric;
  d_km numeric;
begin
  select * into t from public.carpool_trips where id = p_trip_id;
  if not found then
    return;
  end if;
  select * into o from private.carpool_trip_offset where trip_id = p_trip_id;
  p_br := 2 * pg_catalog.pi() * pg_catalog.random();
  d_br := 2 * pg_catalog.pi() * pg_catalog.random();
  p_km := 0.9 + (pg_catalog.random() * 0.2);
  d_km := 0.9 + (pg_catalog.random() * 0.2);
  if o.trip_id is null then
    insert into private.carpool_trip_offset (
      trip_id, pickup_bearing_rad, pickup_km, dest_bearing_rad, dest_km,
      pickup_src_lat, pickup_src_lng, dest_src_lat, dest_src_lng
    ) values (
      p_trip_id, p_br, p_km, d_br, d_km,
      t.pickup_lat, t.pickup_lng, t.dest_lat, t.dest_lng
    );
    return;
  end if;
  if private.carpool_haversine_km(
       o.pickup_src_lat, o.pickup_src_lng, t.pickup_lat, t.pickup_lng
     ) > 0.2 then
    update private.carpool_trip_offset
       set pickup_bearing_rad = p_br,
           pickup_km = p_km,
           pickup_src_lat = t.pickup_lat,
           pickup_src_lng = t.pickup_lng
     where trip_id = p_trip_id;
  end if;
  if private.carpool_haversine_km(
       o.dest_src_lat, o.dest_src_lng, t.dest_lat, t.dest_lng
     ) > 0.2 then
    update private.carpool_trip_offset
       set dest_bearing_rad = d_br,
           dest_km = d_km,
           dest_src_lat = t.dest_lat,
           dest_src_lng = t.dest_lng
     where trip_id = p_trip_id;
  end if;
end;
$$;

revoke all on function private.carpool_ensure_trip_offset(uuid) from public, anon, authenticated;

create or replace function private.carpool_trip_offset_on_trips()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.carpool_ensure_trip_offset(new.id);
  return new;
end;
$$;

revoke execute on function private.carpool_trip_offset_on_trips() from public, anon, authenticated;

drop trigger if exists carpool_trip_offset_on_trips on public.carpool_trips;
create trigger carpool_trip_offset_on_trips
  after insert or update of pickup_lat, pickup_lng, dest_lat, dest_lng
  on public.carpool_trips
  for each row
  execute function private.carpool_trip_offset_on_trips();

insert into private.carpool_trip_offset (
  trip_id, pickup_bearing_rad, pickup_km, dest_bearing_rad, dest_km,
  pickup_src_lat, pickup_src_lng, dest_src_lat, dest_src_lng
)
select t.id,
       2 * pg_catalog.pi() * pg_catalog.random(),
       0.9 + (pg_catalog.random() * 0.2),
       2 * pg_catalog.pi() * pg_catalog.random(),
       0.9 + (pg_catalog.random() * 0.2),
       t.pickup_lat, t.pickup_lng, t.dest_lat, t.dest_lng
  from public.carpool_trips t
 where not exists (
   select 1 from private.carpool_trip_offset o where o.trip_id = t.id
 );

-- Reveal true pickup to booked riders 30 min before depart_at, or when
-- status is in_progress/completed. carpool-web never sets in_progress.
create or replace function private.carpool_visible_geo(p_trip_id uuid)
returns table (
  pickup_lat double precision,
  pickup_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  pickup_label text,
  dest_label text,
  hide_dest boolean,
  pickup_approx boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t public.carpool_trips%rowtype;
  o private.carpool_trip_offset%rowtype;
  reveal_pickup boolean;
  mask_dest boolean;
  off_lat double precision;
  off_lng double precision;
begin
  select * into t from public.carpool_trips where id = p_trip_id;
  if not found then
    return;
  end if;
  perform private.carpool_ensure_trip_offset(p_trip_id);
  select * into o from private.carpool_trip_offset where trip_id = p_trip_id;

  reveal_pickup := (t.owner_id is not distinct from uid)
    or (
      uid is not null
      and exists (
        select 1 from public.carpool_bookings b
         where b.trip_id = t.id and b.rider_id = uid
      )
      and (
        t.status in ('in_progress', 'completed')
        or t.depart_at <= pg_catalog.now() + interval '30 minutes'
      )
    );
  mask_dest := (t.owner_id is distinct from uid) and t.hide_dest;

  pickup_approx := not reveal_pickup;
  hide_dest := t.hide_dest;

  if reveal_pickup then
    pickup_lat := private.carpool_round_deg(t.pickup_lat);
    pickup_lng := private.carpool_round_deg(t.pickup_lng);
    pickup_label := t.pickup_label;
  else
    select p.lat, p.lng into off_lat, off_lng
      from private.carpool_offset_point(
        t.pickup_lat, t.pickup_lng, o.pickup_bearing_rad, o.pickup_km
      ) p;
    pickup_lat := private.carpool_round_deg(off_lat);
    pickup_lng := private.carpool_round_deg(off_lng);
    pickup_label := private.carpool_coarse_label(t.pickup_label);
  end if;

  if not mask_dest then
    dest_lat := private.carpool_round_deg(t.dest_lat);
    dest_lng := private.carpool_round_deg(t.dest_lng);
    dest_label := t.dest_label;
  else
    select p.lat, p.lng into off_lat, off_lng
      from private.carpool_offset_point(
        t.dest_lat, t.dest_lng, o.dest_bearing_rad, o.dest_km
      ) p;
    dest_lat := private.carpool_round_deg(off_lat);
    dest_lng := private.carpool_round_deg(off_lng);
    dest_label := private.carpool_coarse_label(t.dest_label);
  end if;

  return next;
end;
$$;

comment on function private.carpool_visible_geo(uuid) is
  'Viewer-masked origin/dest. Offset ~1 km from private bearing. Pickup revealed to booked riders 30 min before depart or in_progress/completed. Internal.';

revoke all on function private.carpool_visible_geo(uuid) from public, anon, authenticated;

create or replace function private.carpool_route_vertices(p_trip_id uuid)
returns table (idx integer, lat double precision, lng double precision)
language sql
volatile
security definer
set search_path = ''
as $$
  select 0, g.pickup_lat, g.pickup_lng
    from private.carpool_visible_geo(p_trip_id) g
  union all
  select s.seq,
         private.carpool_round_deg(s.lat),
         private.carpool_round_deg(s.lng)
    from public.carpool_trip_stops s
   where s.trip_id = p_trip_id
  union all
  select coalesce((
           select max(s.seq) from public.carpool_trip_stops s where s.trip_id = p_trip_id
         ), 0) + 1,
         g.dest_lat,
         g.dest_lng
    from private.carpool_visible_geo(p_trip_id) g;
$$;

comment on function private.carpool_route_vertices(uuid) is
  'Ordered route vertices: masked origin/dest for the viewer, true stops. 3-decimal. Internal.';

revoke all on function private.carpool_route_vertices(uuid) from public, anon, authenticated;

create or replace function private.carpool_search_distances(
  p_trip_id uuid,
  p_kind public.carpool_trip_kind,
  p_max_detour_km numeric,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_radius_km numeric
)
returns table (
  pickup_distance_km numeric,
  dest_distance_km numeric,
  extra_km numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  has_pickup boolean := (p_pickup_lat is not null and p_pickup_lng is not null);
  has_dest boolean := (p_dest_lat is not null and p_dest_lng is not null);
  v_radius numeric;
  pickup_lat double precision;
  pickup_lng double precision;
  dest_lat double precision;
  dest_lng double precision;
  i_p integer := 0;
  d_p double precision;
  d_d double precision;
  floor_km numeric;
  dist double precision;
  r record;
  lat_pad double precision;
  lng_pad double precision;
begin
  if not has_pickup and not has_dest then
    pickup_distance_km := null;
    dest_distance_km := null;
    extra_km := null;
    return next;
    return;
  end if;

  -- Radius 1–30 km, default 5. NaN/non-finite falls back to 5.
  v_radius := 5;
  if p_radius_km is not null and p_radius_km >= 1 and p_radius_km <= 30 then
    v_radius := p_radius_km;
  elsif p_radius_km is not null and p_radius_km < 1 then
    v_radius := 1;
  elsif p_radius_km is not null and p_radius_km > 30 then
    v_radius := 30;
  end if;

  pickup_lat := private.carpool_round_deg(p_pickup_lat);
  pickup_lng := private.carpool_round_deg(p_pickup_lng);
  dest_lat := private.carpool_round_deg(p_dest_lat);
  dest_lng := private.carpool_round_deg(p_dest_lng);

  if has_pickup then
    lat_pad := v_radius / 111.0 + 0.01;
    lng_pad := v_radius / (111.0 * greatest(0.2, pg_catalog.cos(pg_catalog.radians(pickup_lat)))) + 0.01;
    d_p := null;
    i_p := null;
    for r in
      select v.idx, v.lat, v.lng
        from private.carpool_route_vertices(p_trip_id) v
       order by v.idx
    loop
      if abs(r.lat - pickup_lat) > lat_pad or abs(r.lng - pickup_lng) > lng_pad then
        continue;
      end if;
      dist := private.carpool_haversine_km(pickup_lat, pickup_lng, r.lat, r.lng);
      if d_p is null or dist < d_p then
        d_p := dist;
        i_p := r.idx;
      end if;
    end loop;
    if i_p is null then
      for r in
        select v.idx, v.lat, v.lng
          from private.carpool_route_vertices(p_trip_id) v
         order by v.idx
      loop
        dist := private.carpool_haversine_km(pickup_lat, pickup_lng, r.lat, r.lng);
        if d_p is null or dist < d_p then
          d_p := dist;
          i_p := r.idx;
        end if;
      end loop;
    end if;
    if d_p is null or d_p > v_radius then
      return;
    end if;
  end if;

  if has_dest then
    lat_pad := v_radius / 111.0 + 0.01;
    lng_pad := v_radius / (111.0 * greatest(0.2, pg_catalog.cos(pg_catalog.radians(dest_lat)))) + 0.01;
    d_d := null;
    for r in
      select v.idx, v.lat, v.lng
        from private.carpool_route_vertices(p_trip_id) v
       where v.idx >= i_p
       order by v.idx
    loop
      if abs(r.lat - dest_lat) > lat_pad or abs(r.lng - dest_lng) > lng_pad then
        continue;
      end if;
      dist := private.carpool_haversine_km(dest_lat, dest_lng, r.lat, r.lng);
      if d_d is null or dist < d_d then
        d_d := dist;
      end if;
    end loop;
    if d_d is null then
      for r in
        select v.idx, v.lat, v.lng
          from private.carpool_route_vertices(p_trip_id) v
         where v.idx >= i_p
         order by v.idx
      loop
        dist := private.carpool_haversine_km(dest_lat, dest_lng, r.lat, r.lng);
        if d_d is null or dist < d_d then
          d_d := dist;
        end if;
      end loop;
    end if;
    if d_d is null or d_d > v_radius then
      return;
    end if;
    -- L1: same floor book_seat will enforce. Do not list a taxi the cap
    -- would reject. extra_km uses this floor for the dest component.
    floor_km := private.carpool_detour_floor_km(p_trip_id, p_dest_lat, p_dest_lng);
    if p_kind = 'taxi' and p_max_detour_km is not null and floor_km > p_max_detour_km then
      return;
    end if;
  end if;

  pickup_distance_km := case
    when has_pickup then private.carpool_round_km_half(d_p::numeric)
    else null
  end;
  dest_distance_km := case
    when has_dest then private.carpool_round_km_half(d_d::numeric)
    else null
  end;
  extra_km := private.carpool_round_km_half(
    (coalesce(d_p, 0) + coalesce(floor_km, 0))::numeric
  );
  return next;
end;
$$;

comment on function private.carpool_search_distances(
  uuid, public.carpool_trip_kind, numeric,
  double precision, double precision, double precision, double precision, numeric
) is
  'Point-to-vertex haversine on 3-decimal coords; km snapped to 0.5. Pickup i_p; dest idx >= i_p. extra_km dest component = carpool_detour_floor_km; taxi excluded when floor > max_detour_km. Internal.';

revoke all on function private.carpool_search_distances(
  uuid, public.carpool_trip_kind, numeric,
  double precision, double precision, double precision, double precision, numeric
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discover: nearby-point search. Province/district params kept, ignored.
-- DROP + CREATE because RETURNS TABLE gained columns. Re-grant EXECUTE
-- to authenticated, service_role only (anon gets none).
-- ---------------------------------------------------------------------------
drop function if exists public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text
);
drop function if exists public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text,
  double precision, double precision, double precision, double precision, numeric
);

create function public.carpool_discover_trips(
  p_kind public.carpool_trip_kind default null,
  p_origin_province_code text default null,
  p_dest_province_code text default null,
  p_origin_district_code text default null,
  p_dest_district_code text default null,
  p_pickup_lat double precision default null,
  p_pickup_lng double precision default null,
  p_dest_lat double precision default null,
  p_dest_lng double precision default null,
  p_radius_km numeric default null
)
returns table (
  id uuid,
  kind public.carpool_trip_kind,
  vehicle_type public.carpool_vehicle_type,
  car_icon text,
  route_km numeric,
  depart_at timestamptz,
  status public.carpool_trip_status,
  pickup_label text,
  dest_label text,
  pickup_lat double precision,
  pickup_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  trunk_w_cm numeric,
  trunk_h_cm numeric,
  trunk_l_cm numeric,
  open_seats integer,
  bookable_seats integer,
  owner_display_name text,
  is_mine boolean,
  origin_province_code text,
  dest_province_code text,
  origin_district_code text,
  dest_district_code text,
  max_detour_km numeric,
  pickup_distance_km numeric,
  dest_distance_km numeric,
  extra_km numeric,
  hide_dest boolean,
  pickup_approx boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  want_geo boolean := (p_pickup_lat is not null and p_pickup_lng is not null)
                   or (p_dest_lat is not null and p_dest_lng is not null);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- L2: NaN / out-of-range lat/lng. Radius stays clamped 1–30 in the helper.
  if (p_pickup_lat is not null or p_pickup_lng is not null)
     and (
       p_pickup_lat is null or p_pickup_lng is null
       or p_pickup_lat not between -90 and 90
       or p_pickup_lng not between -180 and 180
     ) then
    raise exception 'พิกัดไม่ถูกต้อง ละติจูดต้องอยู่ระหว่าง -90 ถึง 90 และลองจิจูดระหว่าง -180 ถึง 180';
  end if;
  if (p_dest_lat is not null or p_dest_lng is not null)
     and (
       p_dest_lat is null or p_dest_lng is null
       or p_dest_lat not between -90 and 90
       or p_dest_lng not between -180 and 180
     ) then
    raise exception 'พิกัดไม่ถูกต้อง ละติจูดต้องอยู่ระหว่าง -90 ถึง 90 และลองจิจูดระหว่าง -180 ถึง 180';
  end if;

  -- p_origin/dest_province/district_code are accepted (NULL default) for
  -- old clients and ignored: nearby-point search replaced them.

  return query
  select t.id,
         t.kind,
         t.vehicle_type,
         t.car_icon,
         t.route_km,
         t.depart_at,
         t.status,
         g.pickup_label,
         g.dest_label,
         g.pickup_lat,
         g.pickup_lng,
         g.dest_lat,
         g.dest_lng,
         t.trunk_w_cm,
         t.trunk_h_cm,
         t.trunk_l_cm,
         (
           select count(*)::int from public.carpool_seats s
            where s.trip_id = t.id and s.is_open and not s.is_booked
         ) as open_seats,
         (
           select count(*)::int from public.carpool_seats s
            where s.trip_id = t.id and s.is_open
         ) as bookable_seats,
         p.full_name as owner_display_name,
         (t.owner_id = uid) as is_mine,
         t.origin_province_code,
         t.dest_province_code,
         t.origin_district_code,
         t.dest_district_code,
         t.max_detour_km,
         m.pickup_distance_km,
         m.dest_distance_km,
         m.extra_km,
         g.hide_dest,
         g.pickup_approx
    from public.carpool_trips t
    join public.profiles p on p.id = t.owner_id
    join lateral private.carpool_visible_geo(t.id) g on true
    left join lateral private.carpool_search_distances(
      t.id, t.kind, t.max_detour_km,
      p_pickup_lat, p_pickup_lng, p_dest_lat, p_dest_lng, p_radius_km
    ) m on true
   where t.status in ('open', 'full')
     and (p_kind is null or t.kind = p_kind)
     and (not want_geo or m.extra_km is not null)
   order by m.extra_km nulls last, t.depart_at
   limit 50;
end;
$$;

comment on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text,
  double precision, double precision, double precision, double precision, numeric
) is
  'Trip-list discovery. Rounded coords, is_mine, max_detour_km, nearby distances, no owner_id. Geo code params accepted-but-ignored. Nearby-point haversine (vertex).';

revoke all on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text,
  double precision, double precision, double precision, double precision, numeric
) from public, anon;
grant execute on function public.carpool_discover_trips(
  public.carpool_trip_kind, text, text, text, text,
  double precision, double precision, double precision, double precision, numeric
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- L3 LOW (a): skip cap-lowering when the trip is cancelled or completed.
-- L3 LOW (b): the UPDATE already locks this row; concurrent book_seat
-- SELECT … FOR UPDATE waits on that lock. No extra SELECT here.
-- Body copied from 20261118140000 with only those changes.
-- Trigger-only (no EXECUTE grant).
-- ---------------------------------------------------------------------------
create or replace function public.carpool_trips_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  max_floor numeric;
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.owner_id := uid;
    end if;
    new.status := 'open';
    new.updated_at := pg_catalog.now();
    if new.kind = 'taxi' then
      new.vehicle_type := 'sedan';
    end if;
    return new;
  end if;

  new.updated_at := pg_catalog.now();
  if new.owner_id is distinct from old.owner_id then
    raise exception 'cannot change owner_id';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'cannot change trip kind';
  end if;
  if new.vehicle_type is distinct from old.vehicle_type then
    raise exception 'cannot change vehicle_type';
  end if;
  if old.status is distinct from new.status then
    if not (
      (old.status = 'open' and new.status in ('full', 'in_progress', 'cancelled'))
      or (old.status = 'full' and new.status in ('open', 'in_progress', 'cancelled'))
      or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'invalid carpool status transition from % to %', old.status, new.status;
    end if;
  end if;
  -- Lowering the cap: compare the recomputed haversine floor, not stored
  -- detour_km. Skip when the trip itself is cancelled or completed (those
  -- bookings are historical; cancel_booking DELETEs a row, but a cancelled
  -- trip may still have leftover booking rows). The UPDATE already holds
  -- this row's lock, so a concurrent carpool_book_seat FOR UPDATE waits.
  if old.status not in ('cancelled', 'completed')
     and new.max_detour_km is not null
     and old.max_detour_km is not null
     and new.max_detour_km < old.max_detour_km then
    select max(private.carpool_detour_floor_km(b.trip_id, b.dest_lat, b.dest_lng))
      into max_floor
      from public.carpool_bookings b
     where b.trip_id = new.id;
    if max_floor is not null and new.max_detour_km < max_floor then
      raise exception 'ลดระยะออกนอกเส้นทางสูงสุดไม่ได้ มีผู้โดยสารที่จองไว้ออกนอกเส้นทาง % กม.',
        rtrim(rtrim(pg_catalog.round(max_floor, 1)::text, '0'), '.');
    end if;
  end if;
  return new;
end;
$$;

comment on function public.carpool_trips_guard() is
  'Forces owner_id = auth.uid() on insert, status=open, taxi=>sedan, status transitions. Blocks lowering max_detour_km below any active booking floor unless the trip is cancelled or completed. UPDATE already locks the row.';

revoke execute on function public.carpool_trips_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bookings guard: lock the trip FOR UPDATE on insert and dest_* change
-- before carpool_enforce_max_detour. Body from 20261118140000 otherwise.
-- Trigger-only. Thai RAISE. No EXECUTE grant.
-- ---------------------------------------------------------------------------
create or replace function public.carpool_bookings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  st public.carpool_trip_status;
begin
  -- Authenticated has no INSERT/DELETE grant. RPCs are SECURITY DEFINER but
  -- auth.uid() is still the caller — do not reject user JWTs here.
  if tg_op = 'INSERT' then
    if uid is not null then
      new.rider_id := uid;
    end if;
    -- Serialize vs cap-lowering: lock the trip before the floor/cap check.
    perform 1 from public.carpool_trips t where t.id = new.trip_id for update;
    -- Same floor as carpool_book_seat: never store less than haversine;
    -- taxi floor may not exceed max_detour_km.
    new.detour_km := private.carpool_enforce_max_detour(
      new.trip_id, new.dest_lat, new.dest_lng, coalesce(new.detour_km, 0)
    );
    return new;
  end if;
  if tg_op = 'DELETE' then
    if uid is not null and old.rider_id is distinct from uid then
      raise exception 'เฉพาะผู้โดยสารที่ยกเลิกการจองได้';
    end if;
    return old;
  end if;
  if uid is not null then
    if new.rider_id is distinct from old.rider_id
       or new.trip_id is distinct from old.trip_id
       or new.seat_id is distinct from old.seat_id then
      raise exception 'ไม่สามารถโอนการจองได้';
    end if;
    if new.rider_id is distinct from uid then
      raise exception 'เฉพาะผู้โดยสารที่แก้ไขการจองได้';
    end if;
  end if;
  -- Lock the trip for freeze + dest_* recompute so a concurrent cap
  -- lowering cannot slip between the read and the write.
  select t.status into st from public.carpool_trips t where t.id = new.trip_id for update;
  if st in ('in_progress', 'completed', 'cancelled')
     and (
       new.dest_label is distinct from old.dest_label
       or new.dest_lat is distinct from old.dest_lat
       or new.dest_lng is distinct from old.dest_lng
       or new.luggage_h_cm is distinct from old.luggage_h_cm
       or new.luggage_w_cm is distinct from old.luggage_w_cm
       or new.luggage_d_cm is distinct from old.luggage_d_cm
     ) then
    raise exception 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว';
  end if;
  -- dest_* change: recompute floor vs client/NEW value. Else freeze detour_km.
  if new.dest_label is distinct from old.dest_label
     or new.dest_lat is distinct from old.dest_lat
     or new.dest_lng is distinct from old.dest_lng then
    new.detour_km := private.carpool_enforce_max_detour(
      new.trip_id, new.dest_lat, new.dest_lng, coalesce(new.detour_km, 0)
    );
  else
    new.detour_km := old.detour_km;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function public.carpool_bookings_guard() is
  'Freeze identity columns; dest_*/luggage frozen in_progress/completed/cancelled; dest_* recomputes detour floor; otherwise detour_km = OLD. Locks the trip FOR UPDATE on insert/dest change. Trigger-only. Thai RAISE.';

revoke execute on function public.carpool_bookings_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- carpool_book_seat: lock the trip row FOR UPDATE before cap check + insert.
-- Seat row lock kept. Body copied from 20261118130000 with that change.
-- ---------------------------------------------------------------------------
create or replace function public.carpool_book_seat(
  p_trip_id uuid,
  p_position public.carpool_seat_position,
  p_dest_label text,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_detour_km numeric default 0,
  p_luggage_h_cm numeric default null,
  p_luggage_w_cm numeric default null,
  p_luggage_d_cm numeric default null
)
returns public.carpool_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  trip public.carpool_trips%rowtype;
  seat public.carpool_seats%rowtype;
  rec public.carpool_bookings;
  detour numeric;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Serialize vs cap-lowering: lock the trip before status/cap/insert.
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
  if not found then
    raise exception 'trip not found';
  end if;
  if trip.status is distinct from 'open' then
    raise exception 'ทริปนี้ไม่ได้เปิดรับจอง';
  end if;
  if trip.owner_id = uid then
    raise exception 'ไม่สามารถจองทริปของตนเองได้';
  end if;
  if exists (
    select 1 from public.carpool_bookings b
     where b.trip_id = p_trip_id and b.rider_id = uid
  ) then
    raise exception 'คุณจองทริปนี้แล้ว';
  end if;

  select * into seat
    from public.carpool_seats s
   where s.trip_id = p_trip_id
     and s.position = p_position
   for update;

  if not found then
    raise exception 'seat not found';
  end if;
  if seat.is_open is distinct from true then
    raise exception 'ที่นั่งนี้ปิดอยู่';
  end if;
  if seat.is_booked then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  update public.carpool_seats s
     set is_booked = true,
         booked_at = pg_catalog.now()
   where s.id = seat.id
     and s.is_open = true
     and s.is_booked = false
  returning * into seat;

  if not found then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  -- Never store less than the haversine floor. Client may report more.
  -- Taxi: RAISE when the floor exceeds max_detour_km.
  detour := private.carpool_enforce_max_detour(
    p_trip_id, p_dest_lat, p_dest_lng, coalesce(p_detour_km, 0)
  );

  insert into public.carpool_bookings (
    trip_id, rider_id, seat_id,
    dest_label, dest_lat, dest_lng, detour_km,
    luggage_h_cm, luggage_w_cm, luggage_d_cm
  ) values (
    p_trip_id, uid, seat.id,
    p_dest_label, p_dest_lat, p_dest_lng, detour,
    p_luggage_h_cm, p_luggage_w_cm, p_luggage_d_cm
  ) returning * into rec;

  perform private.carpool_refresh_status(p_trip_id);
  return rec;
end;
$$;

comment on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) is
  'Atomic seat booking. Locks trip then seat FOR UPDATE; first confirm wins. Loser: ที่นั่งนี้เพิ่งถูกจอง. detour_km = greatest(haversine floor, client); taxi floor may not exceed max_detour_km.';

revoke all on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.carpool_book_seat(
  uuid, public.carpool_seat_position, text, double precision, double precision,
  numeric, numeric, numeric, numeric
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- M2/M3 deadlock: every path that touches trip + seat + booking locks
-- trip, then seat, then booking. Dest change has no seat: trip then booking.
-- cancel_booking previously UPDATEd the seat then refresh_status UPDATEd
-- the trip (opposite of book_seat). claim_owner_seat and set_seat_open
-- locked the seat (or updated it) before refresh_status took the trip.
-- refresh_status now SELECTs the trip FOR UPDATE first so a nested call
-- from a holder of the trip lock is a no-op re-lock.
-- seats_guard only READs trip.owner_id (no lock) while the seat row is
-- already locked by UPDATE — it must not SELECT the trip FOR UPDATE.
-- trips_seed_seats runs AFTER INSERT on the trip (trip already locked).
-- ---------------------------------------------------------------------------
create or replace function private.carpool_refresh_status(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.carpool_trip_status;
  leftover int;
begin
  -- Trip first. Callers that already hold this row re-lock in-session.
  select t.status into st from public.carpool_trips t where t.id = p_trip_id for update;
  if st is null or st in ('completed', 'cancelled', 'in_progress') then
    return;
  end if;
  select count(*)::int into leftover
    from public.carpool_seats s
   where s.trip_id = p_trip_id
     and s.is_open = true
     and s.is_booked = false;
  if leftover = 0 then
    update public.carpool_trips
       set status = 'full', updated_at = pg_catalog.now()
     where id = p_trip_id and status in ('open', 'full');
  else
    update public.carpool_trips
       set status = 'open', updated_at = pg_catalog.now()
     where id = p_trip_id and status in ('open', 'full');
  end if;
end;
$$;

revoke all on function private.carpool_refresh_status(uuid) from public, anon, authenticated;

create or replace function public.carpool_cancel_booking(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rec public.carpool_bookings%rowtype;
  trip public.carpool_trips%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
  if not found then
    raise exception 'trip not found';
  end if;
  if trip.status is distinct from 'open' and trip.status is distinct from 'full' then
    raise exception 'cannot cancel booking on this trip';
  end if;
  select * into rec
    from public.carpool_bookings b
   where b.trip_id = p_trip_id and b.rider_id = uid;
  if not found then
    raise exception 'booking not found';
  end if;

  perform 1 from public.carpool_seats s where s.id = rec.seat_id for update;
  perform 1 from public.carpool_bookings b where b.id = rec.id for update;

  delete from public.carpool_bookings b where b.id = rec.id;
  update public.carpool_seats s
     set is_booked = false, booked_at = null
   where s.id = rec.seat_id;
  perform private.carpool_refresh_status(p_trip_id);
end;
$$;

comment on function public.carpool_cancel_booking(uuid) is
  'Cancel own booking. Locks trip then seat then booking FOR UPDATE, then DELETE + unbook. Trigger-only bookings_guard on DELETE.';

revoke all on function public.carpool_cancel_booking(uuid) from public, anon;
grant execute on function public.carpool_cancel_booking(uuid) to authenticated, service_role;

-- M3: rider dest change. Helper in private; public RPC is the only dest_*
-- write path for authenticated. Lock trip then booking (never the reverse).
create or replace function private.carpool_apply_booking_dest(
  p_trip_id uuid,
  p_rider_id uuid,
  p_dest_label text,
  p_dest_lat double precision,
  p_dest_lng double precision
)
returns public.carpool_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  trip public.carpool_trips%rowtype;
  rec public.carpool_bookings%rowtype;
begin
  if p_rider_id is null then
    raise exception 'not authenticated';
  end if;
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
  if not found then
    raise exception 'trip not found';
  end if;

  select * into rec
    from public.carpool_bookings b
   where b.trip_id = p_trip_id
     and b.rider_id = p_rider_id
   for update;
  if not found then
    raise exception 'booking not found';
  end if;
  if rec.rider_id is distinct from p_rider_id then
    raise exception 'เฉพาะผู้โดยสารที่แก้ไขการจองได้';
  end if;
  if trip.status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'ไม่สามารถเปลี่ยนจุดลงหรือสัมภาระหลังจากทริปเริ่มแล้ว';
  end if;

  -- bookings_guard (already holding this trip lock) recomputes detour_km
  -- via carpool_enforce_max_detour — same floor / max_detour as today.
  update public.carpool_bookings b
     set dest_label = p_dest_label,
         dest_lat = p_dest_lat,
         dest_lng = p_dest_lng
   where b.id = rec.id
  returning * into rec;
  return rec;
end;
$$;

revoke all on function private.carpool_apply_booking_dest(
  uuid, uuid, text, double precision, double precision
) from public, anon, authenticated;

create or replace function public.carpool_set_booking_dest(
  p_trip_id uuid,
  p_dest_label text,
  p_dest_lat double precision,
  p_dest_lng double precision
)
returns public.carpool_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rec public.carpool_bookings;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  rec := private.carpool_apply_booking_dest(
    p_trip_id, uid, p_dest_label, p_dest_lat, p_dest_lng
  );
  return rec;
end;
$$;

comment on function public.carpool_set_booking_dest(
  uuid, text, double precision, double precision
) is
  'Rider changes own drop-off. Locks trip then booking FOR UPDATE; max_detour/floor via bookings_guard. Direct dest_* UPDATE is revoked.';

revoke all on function public.carpool_set_booking_dest(
  uuid, text, double precision, double precision
) from public, anon;
grant execute on function public.carpool_set_booking_dest(
  uuid, text, double precision, double precision
) to authenticated, service_role;

create or replace function public.carpool_claim_owner_seat(
  p_trip_id uuid,
  p_position public.carpool_seat_position,
  p_luggage_h_cm numeric default null,
  p_luggage_w_cm numeric default null,
  p_luggage_d_cm numeric default null
)
returns public.carpool_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  trip public.carpool_trips%rowtype;
  seat public.carpool_seats%rowtype;
  rec public.carpool_bookings;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
  if not found then
    raise exception 'trip not found';
  end if;
  if trip.owner_id is distinct from uid then
    raise exception 'only the trip owner';
  end if;
  if trip.kind is distinct from 'taxi' then
    raise exception 'owner seat claim is taxi only';
  end if;
  if trip.status is distinct from 'open' then
    raise exception 'ทริปนี้ไม่ได้เปิดรับจอง';
  end if;
  if exists (
    select 1 from public.carpool_bookings b
     where b.trip_id = p_trip_id and b.rider_id = uid
  ) then
    raise exception 'คุณจองทริปนี้แล้ว';
  end if;

  select * into seat
    from public.carpool_seats s
   where s.trip_id = p_trip_id and s.position = p_position
   for update;
  if not found then
    raise exception 'seat not found';
  end if;
  if seat.is_open is distinct from true then
    raise exception 'ที่นั่งนี้ปิดอยู่';
  end if;
  if seat.is_booked then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  update public.carpool_seats s
     set is_booked = true, booked_at = pg_catalog.now()
   where s.id = seat.id and s.is_open = true and s.is_booked = false
  returning * into seat;
  if not found then
    raise exception 'ที่นั่งนี้เพิ่งถูกจอง';
  end if;

  insert into public.carpool_bookings (
    trip_id, rider_id, seat_id,
    dest_label, dest_lat, dest_lng, detour_km,
    luggage_h_cm, luggage_w_cm, luggage_d_cm
  ) values (
    p_trip_id, uid, seat.id,
    trip.dest_label, trip.dest_lat, trip.dest_lng, 0,
    p_luggage_h_cm, p_luggage_w_cm, p_luggage_d_cm
  ) returning * into rec;

  perform private.carpool_refresh_status(p_trip_id);
  return rec;
end;
$$;

comment on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) is
  'Taxi owner books own passenger seat. Locks trip then seat FOR UPDATE.';

revoke all on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) from public, anon;
grant execute on function public.carpool_claim_owner_seat(
  uuid, public.carpool_seat_position, numeric, numeric, numeric
) to authenticated, service_role;

create or replace function public.carpool_set_seat_open(
  p_trip_id uuid,
  p_position public.carpool_seat_position,
  p_is_open boolean
)
returns public.carpool_seats
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  trip public.carpool_trips%rowtype;
  rec public.carpool_seats;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select * into trip
    from public.carpool_trips t
   where t.id = p_trip_id
   for update;
  if trip.owner_id is distinct from uid then
    raise exception 'only the trip owner';
  end if;

  update public.carpool_seats s
     set is_open = p_is_open
   where s.trip_id = p_trip_id
     and s.position = p_position
     and s.is_booked = false
  returning * into rec;
  if not found then
    raise exception 'cannot open/close a booked seat';
  end if;
  perform private.carpool_refresh_status(p_trip_id);
  return rec;
end;
$$;

comment on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) is
  'Owner toggles is_open. Locks trip then updates seat, then refresh_status.';

revoke all on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) from public, anon;
grant execute on function public.carpool_set_seat_open(
  uuid, public.carpool_seat_position, boolean
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Preview: same payload as 130000, but origin/dest go through visible_geo.
-- ---------------------------------------------------------------------------
create or replace function public.carpool_trip_preview(p_trip_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rec jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select jsonb_build_object(
           'id', t.id,
           'kind', t.kind,
           'vehicle_type', t.vehicle_type,
           'car_icon', t.car_icon,
           'route_km', t.route_km,
           'depart_at', t.depart_at,
           'status', t.status,
           'pickup_label', g.pickup_label,
           'dest_label', g.dest_label,
           'pickup_lat', g.pickup_lat,
           'pickup_lng', g.pickup_lng,
           'dest_lat', g.dest_lat,
           'dest_lng', g.dest_lng,
           'trunk_w_cm', t.trunk_w_cm,
           'trunk_h_cm', t.trunk_h_cm,
           'trunk_l_cm', t.trunk_l_cm,
           'owner_display_name', p.full_name,
           'is_mine', t.owner_id = uid,
           'origin_province_code', t.origin_province_code,
           'dest_province_code', t.dest_province_code,
           'origin_district_code', t.origin_district_code,
           'dest_district_code', t.dest_district_code,
           'max_detour_km', t.max_detour_km,
           'hide_dest', g.hide_dest,
           'pickup_approx', g.pickup_approx,
           'stops', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'seq', st.seq,
               'address', st.address,
               'lat', pg_catalog.round(st.lat::numeric, 3),
               'lng', pg_catalog.round(st.lng::numeric, 3)
             ) order by st.seq), '[]'::jsonb)
               from public.carpool_trip_stops st
              where st.trip_id = t.id
           ),
           'luggage', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'height_cm', b.luggage_h_cm,
               'width_cm', b.luggage_w_cm,
               'depth_cm', b.luggage_d_cm
             ) order by
                 (b.luggage_h_cm * b.luggage_w_cm * b.luggage_d_cm) desc,
                 b.luggage_h_cm,
                 b.luggage_w_cm,
                 b.luggage_d_cm
             ), '[]'::jsonb)
               from public.carpool_bookings b
              where b.trip_id = t.id
                and b.luggage_h_cm is not null
                and b.luggage_w_cm is not null
                and b.luggage_d_cm is not null
           ),
           'seats', (
             select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'position', s.position,
               'is_open', s.is_open,
               'is_booked', s.is_booked
             ) order by s.position), '[]'::jsonb)
               from public.carpool_seats s
              where s.trip_id = t.id
           )
         )
    into rec
    from public.carpool_trips t
    join public.profiles p on p.id = t.owner_id
    join lateral private.carpool_visible_geo(t.id) g on true
   where t.id = p_trip_id
     and t.status in ('open', 'full', 'in_progress', 'completed', 'cancelled');

  if rec is null then
    raise exception 'trip not found';
  end if;
  return rec;
end;
$$;

comment on function public.carpool_trip_preview(uuid) is
  'Join-page preview: viewer-masked origin/dest (offset ~1 km), is_mine (never owner_id), anonymized seats and luggage. Pickup revealed to booked riders 30 min before depart.';

revoke all on function public.carpool_trip_preview(uuid) from public, anon;
grant execute on function public.carpool_trip_preview(uuid) to authenticated, service_role;

-- Non-owners must not SELECT true coords or house-level labels from the table.
-- Postgres cannot revoke a table-level SELECT per column, so revoke SELECT
-- then re-grant every column except geo/labels. INSERT/UPDATE of true
-- columns stays so CreateTripPage can write them. Reads go through
-- preview/discover/visible_trips (DEFINER).
revoke select on table public.carpool_trips from authenticated;
grant select (
  id, owner_id, kind, vehicle_type, car_icon,
  trunk_w_cm, trunk_h_cm, trunk_l_cm, route_km,
  depart_at, status, created_at, updated_at,
  origin_province_code, dest_province_code,
  origin_district_code, dest_district_code,
  max_detour_km, hide_dest
) on table public.carpool_trips to authenticated;

drop function if exists public.carpool_visible_trips();
create or replace function public.carpool_visible_trips()
returns table (
  id uuid,
  kind public.carpool_trip_kind,
  vehicle_type public.carpool_vehicle_type,
  car_icon text,
  route_km numeric,
  depart_at timestamptz,
  status public.carpool_trip_status,
  pickup_label text,
  dest_label text,
  pickup_lat double precision,
  pickup_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  trunk_w_cm numeric,
  trunk_h_cm numeric,
  trunk_l_cm numeric,
  is_mine boolean,
  hide_dest boolean,
  pickup_approx boolean,
  max_detour_km numeric,
  owner_display_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  return query
  select t.id,
         t.kind,
         t.vehicle_type,
         t.car_icon,
         t.route_km,
         t.depart_at,
         t.status,
         g.pickup_label,
         g.dest_label,
         g.pickup_lat,
         g.pickup_lng,
         g.dest_lat,
         g.dest_lng,
         t.trunk_w_cm,
         t.trunk_h_cm,
         t.trunk_l_cm,
         (t.owner_id = uid),
         g.hide_dest,
         g.pickup_approx,
         t.max_detour_km,
         p.full_name
    from public.carpool_trips t
    join public.profiles p on p.id = t.owner_id
    join lateral private.carpool_visible_geo(t.id) g on true
   where t.owner_id = uid
      or exists (
        select 1 from public.carpool_bookings b
         where b.trip_id = t.id and b.rider_id = uid
      )
      or (select private.is_admin());
end;
$$;

comment on function public.carpool_visible_trips() is
  'My Trips / history: viewer-masked origin/dest, is_mine, never owner_id or bearing.';

revoke all on function public.carpool_visible_trips() from public, anon;
grant execute on function public.carpool_visible_trips() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C2.5 rider drop-off. SELECT stays rider-own/owner/admin
-- (carpool_bookings_select from 20261118100000). dest_* writes go through
-- carpool_set_booking_dest (trip then booking). Luggage is only set in
-- book_seat — no post-booking UPDATE path (M6). Preview luggage is
-- anonymized dims only (no dest). Discover does not return booking dest.
-- ---------------------------------------------------------------------------
revoke update on table public.carpool_bookings from public, anon, authenticated;
revoke update (
  dest_label, dest_lat, dest_lng,
  luggage_h_cm, luggage_w_cm, luggage_d_cm, updated_at
) on table public.carpool_bookings from public, anon, authenticated;
