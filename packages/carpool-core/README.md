# @drop/carpool-core

Pure TypeScript logic for **เพื่อนร่วมทาง** (Phase C1). No database, no UI, no runtime dependencies.

| Module | What it does |
|--------|----------------|
| `fare.ts` | Split a km-based fare in satang, plus a per-passenger detour surcharge |
| `dropoffOrder.ts` | Shortest drop-off permutation (≤ 4 riders); haversine by default |
| `trunk.ts` | Scaled trunk rect + luggage fill in a 2D frame |

```bash
npm test -w @drop/carpool-core
npm run typecheck -w @drop/carpool-core
```

---

## Fare / ค่าโดยสาร

**EN.** `RATE_THB_PER_KM = 7` (exported; pass `rateThbPerKm` to override).

- `mainFare = mainRouteKm * rate`
- Split **equally** among **seated occupants only** (seat is **open AND booked**). Closed or unbooked seats pay **0**.
- Same formula for **taxi** and **private car**.
- On a private car the **owner-driver counts as one payer** (cost-sharing only, **no wage** — labelled `ownerDriverCostSharing`).
- Passenger-requested off-route stop: `detourKm * 2 * rate`, charged **only to that passenger**. Detour km are **not** part of `mainRouteKm`.
- **Luggage does not affect fare.**
- Amounts are 2-decimal THB, computed as **integer satang**. Leftover satang from the equal split go to payers in **ascending id order** so the amounts **sum to the exact total**.

**TH.** อัตรา `RATE_THB_PER_KM = 7` บาท/กม. (ส่ง `rateThbPerKm` เพื่อเปลี่ยน)

- ค่าหลัก = ระยะทางหลัก (กม.) × อัตรา
- หาร **เท่ากัน** เฉพาะ **ผู้ที่นั่งจริง** (ที่นั่ง **เปิด และ จองแล้ว**) ที่นั่งปิดหรือยังไม่จอง **จ่าย 0**
- **แท็กซี่** กับ **รถส่วนตัว** ใช้สูตรเดียวกัน
- รถส่วนตัว: **เจ้าของรถที่ขับนับเป็นผู้จ่าย 1 คน** (แชร์ค่าใช้จ่ายอย่างเดียว **ไม่มีค่าจ้าง**)
- จุดแวะนอกเส้นทางที่ผู้โดยสารขอ: `detourKm × 2 × อัตรา` คิด **เฉพาะคนนั้น** ระยะทางอ้อม **ไม่นับ** ในระยะทางหลัก
- **สัมภาระไม่กระทบค่าโดยสาร**
- คิดเป็น **สตางค์จำนวนเต็ม** (2 ตำแหน่งทศนิยม) เศษสตางค์แจกตาม **id เรียงน้อย→มาก** ให้ผลรวมเท่ายอดจริง

### Worked examples / ตัวอย่าง

Taxi A/B/C, 12 km, B detours 1.5 km (`rate = 7`):

| | EN | TH |
|---|----|----|
| Main | `12 × 7 = 84` THB ÷ 3 = **28** each | ค่าหลัก 84 บาท หาร 3 = คนละ 28 |
| B detour | `1.5 × 2 × 7 = 21` THB | ค่าทางอ้อมของ B = 21 |
| Result | **A 28, B 49, C 28** (total **105**) | **A 28, B 49, C 28** (รวม **105**) |

Private car + owner-driver, same trip:

| | EN | TH |
|---|----|----|
| Main | `84` THB ÷ 4 payers (A, B, C, driver) = **21** | 84 บาท หาร 4 คน (รวมคนขับ) = คนละ 21 |
| B detour | still **21**, only B | ค่าทางอ้อม 21 ยังคิดเฉพาะ B |
| Result | **A 21, B 42, C 21, driver 21** (total **105**) | **A 21, B 42, C 21, คนขับ 21** (รวม **105**) |

Rounding: 10 km / 3 payers → `70` THB = 7000 satang. `7000 / 3 = 2333` rem `1`. Ids A,B,C → **A 23.34, B 23.33, C 23.33** (sum **70.00**).

---

## Drop-off order / ลำดับลงรถ

**EN.** Given a pickup and rider destinations, choose the visit order with the **shortest total** `pickup → d1 → d2 → …`.

- Brute-force **all permutations** for **n ≤ 4** (at most 24).
- **n > 4 throws** `DropoffOrderError` (`TOO_MANY_RIDERS`). There is **no silent fallback**. OSRM / a heuristic is a later phase.
- Distance function is **pluggable** and may be **async**. Default: **haversine** (meters).
- Equal totals: pick the **lexicographically smaller id sequence**.

**TH.** รับจุดรับและจุดหมายของผู้โดยสาร เลือกลำดับที่ **ระยะรวมสั้นสุด** `จุดรับ → d1 → d2 → …`

- ลอง **ทุก permutation** เมื่อมีผู้โดยสาร **ไม่เกิน 4 คน** (สูงสุด 24 แบบ)
- **เกิน 4 คน โยน error** (`TOO_MANY_RIDERS`) **ไม่มี fallback เงียบ** — OSRM / heuristic มาทีหลัง
- ฟังก์ชันระยะทาง **เปลี่ยนได้** และรองรับ **async** ค่าเริ่มต้น: **haversine** (เมตร)
- ระยะเท่ากัน: เลือกลำดับ **id ที่น้อยกว่าแบบ lexicographic**

---

## Trunk / ท้ายรถ

Taxi-share trips use the exported `TAXI_TRUNK_PRESET` (100×40×50 cm = 200 L usable). Private-car trips keep driver-entered dimensions. Remaining space is `remainingTrunkSpace(trunk, luggage)` (sum of pieces; order does not matter). Overflow when used volume > capacity.

**EN.** Trunk `W, H, L` (cm) drawn in a frame `frameW × frameH`.

1. Uniform scale `s = min(frameW / W, frameH / H)`.
2. Rect size `(W·s) × (H·s)`, **centered** in the frame.
3. **Min short side = 40%** of the frame’s **corresponding** side (width↔`frameW`, height↔`frameH`). If the uniform scale undershoots, **raise `s`** until the short side hits 40%. The long side may then overflow the frame; the rect stays centered (`x`/`y` can be negative).
4. Corner radius = **8%** of the rect’s shorter side.
5. Per-rider luggage `H × W × D` cm. `usedVol = Σ(H·W·D)`.
6. `fillHeight = H·s·usedVol / (W·H·L)`, **capped** at the rect height.
7. `overflow = usedVol > W·H·L`. `fillRatio = usedVol / (W·H·L)` (may be `> 1`).

**TH.** ขนาดท้ายรถ `W, H, L` ซม. วาดในเฟรม `frameW × frameH`

1. สเกลเท่ากัน `s = min(frameW / W, frameH / H)`
2. สี่เหลี่ยม `(W·s) × (H·s)` **อยู่กลางเฟรม**
3. **ด้านสั้นอย่างน้อย 40%** ของด้านเฟรมที่ **คู่กัน** ถ้าสเกลเท่ากันเล็กเกินไป **ดัน `s` ขึ้น** ด้านยาวอาจล้นเฟรม (ยังจัดกลาง `x`/`y` ติดลบได้)
4. มุมโค้ง = **8%** ของด้านที่สั้นกว่าของสี่เหลี่ยม
5. สัมภาระต่อคน `H × W × D` ซม. `usedVol = ผลรวม`
6. `fillHeight = H·s·usedVol / (W·H·L)` **ไม่เกิน** ความสูงสี่เหลี่ยม
7. `overflow = usedVol > W·H·L` · `fillRatio = usedVol / (W·H·L)` (มากกว่า 1 ได้)

Empty: `usedVol = 0`, `fillHeight = 0`, `fillRatio = 0`, `overflow = false`.  
Exact-full: `fillRatio = 1`, `fillHeight` = rect height, `overflow = false`.  
Overflow: `fillRatio > 1`, `fillHeight` capped, `overflow = true`.
