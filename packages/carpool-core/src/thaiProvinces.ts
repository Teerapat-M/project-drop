/** Fallback when the last address part is not an allowlisted province. */
export const NEARBY_AREA_LABEL = 'พื้นที่ใกล้เคียง';

/**
 * 77 Thai provinces: canonical Thai name + aliases (Thai, English, Google
 * romanizations). Hand-written; not a bundled geo dataset.
 */
export const THAI_PROVINCE_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['กรุงเทพมหานคร', ['กรุงเทพฯ', 'กรุงเทพ', 'กทม.', 'กทม', 'Bangkok', 'Bangkok Metropolis', 'Krung Thep Maha Nakhon', 'Krung Thep', 'Krungthep']],
  ['กระบี่', ['Krabi']],
  ['กาญจนบุรี', ['Kanchanaburi']],
  ['กาฬสินธุ์', ['Kalasin']],
  ['กำแพงเพชร', ['Kamphaeng Phet', 'Kamphaengphet', 'Kampangpetch']],
  ['ขอนแก่น', ['Khon Kaen', 'Khonkaen']],
  ['จันทบุรี', ['Chanthaburi', 'Chantaburi']],
  ['ฉะเชิงเทรา', ['Chachoengsao', 'Chachoeng Sao']],
  ['ชลบุรี', ['Chon Buri', 'Chonburi']],
  ['ชัยนาท', ['Chai Nat', 'Chainat']],
  ['ชัยภูมิ', ['Chaiyaphum']],
  ['ชุมพร', ['Chumphon']],
  ['เชียงราย', ['Chiang Rai', 'Chiangrai']],
  ['เชียงใหม่', ['Chiang Mai', 'Chiangmai']],
  ['ตรัง', ['Trang']],
  ['ตราด', ['Trat']],
  ['ตาก', ['Tak']],
  ['นครนายก', ['Nakhon Nayok', 'Nakhonnayok']],
  ['นครปฐม', ['Nakhon Pathom', 'Nakhonpathom']],
  ['นครพนม', ['Nakhon Phanom', 'Nakhonphanom']],
  ['นครราชสีมา', ['Nakhon Ratchasima', 'Nakhonratchasima', 'Khorat', 'Korat']],
  ['นครศรีธรรมราช', ['Nakhon Si Thammarat', 'Nakhonsithammarat']],
  ['นครสวรรค์', ['Nakhon Sawan', 'Nakhonsawan']],
  ['นนทบุรี', ['Nonthaburi']],
  ['นราธิวาส', ['Narathiwat']],
  ['น่าน', ['Nan']],
  ['บึงกาฬ', ['Bueng Kan', 'Buengkan', 'Bungkan']],
  ['บุรีรัมย์', ['Buri Ram', 'Buriram']],
  ['ปทุมธานี', ['Pathum Thani', 'Pathumthani']],
  ['ประจวบคีรีขันธ์', ['Prachuap Khiri Khan', 'Prachuapkhirikhan']],
  ['ปราจีนบุรี', ['Prachin Buri', 'Prachinburi']],
  ['ปัตตานี', ['Pattani']],
  ['พระนครศรีอยุธยา', ['อยุธยา', 'Ayutthaya', 'Phra Nakhon Si Ayutthaya', 'Phra Nakhon Si Ayudhya', 'Ayudhya']],
  ['พังงา', ['Phangnga', 'Phang Nga', 'Phang-nga']],
  ['พัทลุง', ['Phatthalung', 'Phattalung']],
  ['พิจิตร', ['Phichit']],
  ['พิษณุโลก', ['Phitsanulok']],
  ['เพชรบุรี', ['Phetchaburi', 'Petchaburi']],
  ['เพชรบูรณ์', ['Phetchabun', 'Petchabun']],
  ['แพร่', ['Phrae']],
  ['พะเยา', ['Phayao']],
  ['ภูเก็ต', ['Phuket']],
  ['มหาสารคาม', ['Maha Sarakham', 'Mahasarakham']],
  ['มุกดาหาร', ['Mukdahan']],
  ['แม่ฮ่องสอน', ['Mae Hong Son', 'Maehongson']],
  ['ยโสธร', ['Yasothon']],
  ['ยะลา', ['Yala']],
  ['ร้อยเอ็ด', ['Roi Et', 'Roiet']],
  ['ระนอง', ['Ranong']],
  ['ระยอง', ['Rayong']],
  ['ราชบุรี', ['Ratchaburi']],
  ['ลพบุรี', ['Lopburi', 'Lop Buri']],
  ['ลำปาง', ['Lampang']],
  ['ลำพูน', ['Lamphun']],
  ['เลย', ['Loei']],
  ['ศรีสะเกษ', ['Si Sa Ket', 'Sisaket', 'Sri Saket']],
  ['สกลนคร', ['Sakon Nakhon', 'Sakonnakhon']],
  ['สงขลา', ['Songkhla']],
  ['สตูล', ['Satun']],
  ['สมุทรปราการ', ['Samut Prakan', 'Samut Prakarn', 'Samutprakan', 'Samutprakarn']],
  ['สมุทรสงคราม', ['Samut Songkhram', 'Samutsongkhram']],
  ['สมุทรสาคร', ['Samut Sakhon', 'Samutsakhon']],
  ['สระแก้ว', ['Sa Kaeo', 'Sakaeo', 'Sa Kaew']],
  ['สระบุรี', ['Saraburi']],
  ['สิงห์บุรี', ['Sing Buri', 'Singburi']],
  ['สุโขทัย', ['Sukhothai']],
  ['สุพรรณบุรี', ['Suphan Buri', 'Suphanburi']],
  ['สุราษฎร์ธานี', ['Surat Thani', 'Suratthani']],
  ['สุรินทร์', ['Surin']],
  ['หนองคาย', ['Nong Khai', 'Nongkhai']],
  ['หนองบัวลำภู', ['Nong Bua Lam Phu', 'Nongbualamphu', 'Nong Bua Lamphu']],
  ['อ่างทอง', ['Ang Thong', 'Angthong']],
  ['อำนาจเจริญ', ['Amnat Charoen', 'Amnatcharoen']],
  ['อุดรธานี', ['Udon Thani', 'Udonthani', 'Udorn Thani']],
  ['อุตรดิตถ์', ['Uttaradit']],
  ['อุทัยธานี', ['Uthai Thani', 'Uthaithani']],
  ['อุบลราชธานี', ['Ubon Ratchathani', 'Ubonratchathani']],
];

const FORMAT_CHARS = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\p{Cf}]/gu;
const ANY_DIGIT = /\p{N}/u;
const COUNTRY_PART = /^(thailand|ประเทศไทย|ไทย)$/i;
const POSTCODE_TOKEN = /\s+[0-9]{5}$/;
const PREFIX = /^(จังหวัด|จ\.)\s*/;
const SUFFIX = /\s+(province|changwat)$/i;

export function stripFormatChars(value: string): string {
  return value.normalize('NFC').replace(FORMAT_CHARS, '').replace(/\s+/g, ' ').trim();
}

/** Belt-and-braces \p{N}: NFKC plus the original (Roman/circled/superscript). */
export function textHasNumber(value: string): boolean {
  return ANY_DIGIT.test(value) || ANY_DIGIT.test(value.normalize('NFKC'));
}

export function normProvinceKey(value: string): string {
  let v = stripFormatChars(value).toLowerCase();
  v = v.replace(PREFIX, '').replace(SUFFIX, '').trim();
  return v;
}

const CANONICAL_BY_NORM: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of THAI_PROVINCE_ALIASES) {
    m.set(normProvinceKey(canonical), canonical);
    for (const alias of aliases) m.set(normProvinceKey(alias), canonical);
  }
  return m;
})();

export function lookupCanonicalProvince(part: string): string | null {
  const key = normProvinceKey(part);
  if (!key) return null;
  return CANONICAL_BY_NORM.get(key) ?? null;
}

export function isCountryOnlyPart(part: string): boolean {
  return COUNTRY_PART.test(stripFormatChars(part));
}

export function stripTrailingPostcode(part: string): string {
  return stripFormatChars(part).replace(POSTCODE_TOKEN, '').trim();
}

if (THAI_PROVINCE_ALIASES.length !== 77) {
  throw new Error(`expected 77 provinces, got ${THAI_PROVINCE_ALIASES.length}`);
}
