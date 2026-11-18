/**
 * Thai ADM1 provinces (77) with centroids.
 * Names/codes: DevelopedbyWill/thailand-canonical-admin-names v1.0.0 (CC BY 4.0).
 * https://github.com/DevelopedbyWill/thailand-canonical-admin-names
 * Bangkok pin uses Bell’s city-center 13.7563, 100.5018 instead of the
 * polygon centroid (east of the old town).
 */

export const BANGKOK_PROVINCE_CODE = '10';

export type ThaiProvince = {
  code: string;
  nameTh: string;
  lat: number;
  lng: number;
};

const RAW_PROVINCES: readonly ThaiProvince[] = [
  {
    "code": "10",
    "nameTh": "กรุงเทพมหานคร",
    "lat": 13.7563,
    "lng": 100.5018
  },
  {
    "code": "11",
    "nameTh": "สมุทรปราการ",
    "lat": 13.59348,
    "lng": 100.71411
  },
  {
    "code": "12",
    "nameTh": "นนทบุรี",
    "lat": 13.92598,
    "lng": 100.39339
  },
  {
    "code": "13",
    "nameTh": "ปทุมธานี",
    "lat": 14.06882,
    "lng": 100.69526
  },
  {
    "code": "14",
    "nameTh": "พระนครศรีอยุธยา",
    "lat": 14.3376,
    "lng": 100.52001
  },
  {
    "code": "15",
    "nameTh": "อ่างทอง",
    "lat": 14.61528,
    "lng": 100.35017
  },
  {
    "code": "16",
    "nameTh": "ลพบุรี",
    "lat": 15.10653,
    "lng": 100.90261
  },
  {
    "code": "17",
    "nameTh": "สิงห์บุรี",
    "lat": 14.90962,
    "lng": 100.33995
  },
  {
    "code": "18",
    "nameTh": "ชัยนาท",
    "lat": 15.13292,
    "lng": 100.03932
  },
  {
    "code": "19",
    "nameTh": "สระบุรี",
    "lat": 14.62567,
    "lng": 101.01942
  },
  {
    "code": "20",
    "nameTh": "ชลบุรี",
    "lat": 13.20649,
    "lng": 101.20533
  },
  {
    "code": "21",
    "nameTh": "ระยอง",
    "lat": 12.85585,
    "lng": 101.42339
  },
  {
    "code": "22",
    "nameTh": "จันทบุรี",
    "lat": 12.88478,
    "lng": 102.13092
  },
  {
    "code": "23",
    "nameTh": "ตราด",
    "lat": 12.34526,
    "lng": 102.516
  },
  {
    "code": "24",
    "nameTh": "ฉะเชิงเทรา",
    "lat": 13.60756,
    "lng": 101.43324
  },
  {
    "code": "25",
    "nameTh": "ปราจีนบุรี",
    "lat": 14.05006,
    "lng": 101.65961
  },
  {
    "code": "26",
    "nameTh": "นครนายก",
    "lat": 14.21268,
    "lng": 101.17711
  },
  {
    "code": "27",
    "nameTh": "สระแก้ว",
    "lat": 13.79118,
    "lng": 102.32721
  },
  {
    "code": "30",
    "nameTh": "นครราชสีมา",
    "lat": 14.9568,
    "lng": 102.11116
  },
  {
    "code": "31",
    "nameTh": "บุรีรัมย์",
    "lat": 14.81078,
    "lng": 102.95101
  },
  {
    "code": "32",
    "nameTh": "สุรินทร์",
    "lat": 14.88766,
    "lng": 103.65454
  },
  {
    "code": "33",
    "nameTh": "ศรีสะเกษ",
    "lat": 14.84931,
    "lng": 104.37692
  },
  {
    "code": "34",
    "nameTh": "อุบลราชธานี",
    "lat": 15.19503,
    "lng": 105.11028
  },
  {
    "code": "35",
    "nameTh": "ยโสธร",
    "lat": 15.89662,
    "lng": 104.3366
  },
  {
    "code": "36",
    "nameTh": "ชัยภูมิ",
    "lat": 16.03175,
    "lng": 101.82083
  },
  {
    "code": "37",
    "nameTh": "อำนาจเจริญ",
    "lat": 15.90739,
    "lng": 104.74225
  },
  {
    "code": "38",
    "nameTh": "บึงกาฬ",
    "lat": 18.14875,
    "lng": 103.72741
  },
  {
    "code": "39",
    "nameTh": "หนองบัวลำภู",
    "lat": 17.1842,
    "lng": 102.30777
  },
  {
    "code": "40",
    "nameTh": "ขอนแก่น",
    "lat": 16.40759,
    "lng": 102.57439
  },
  {
    "code": "41",
    "nameTh": "อุดรธานี",
    "lat": 17.41933,
    "lng": 102.86934
  },
  {
    "code": "42",
    "nameTh": "เลย",
    "lat": 17.4074,
    "lng": 101.63113
  },
  {
    "code": "43",
    "nameTh": "หนองคาย",
    "lat": 17.94294,
    "lng": 102.83737
  },
  {
    "code": "44",
    "nameTh": "มหาสารคาม",
    "lat": 15.99083,
    "lng": 103.16696
  },
  {
    "code": "45",
    "nameTh": "ร้อยเอ็ด",
    "lat": 15.92535,
    "lng": 103.82136
  },
  {
    "code": "46",
    "nameTh": "กาฬสินธุ์",
    "lat": 16.62506,
    "lng": 103.61341
  },
  {
    "code": "47",
    "nameTh": "สกลนคร",
    "lat": 17.38635,
    "lng": 103.82659
  },
  {
    "code": "48",
    "nameTh": "นครพนม",
    "lat": 17.38826,
    "lng": 104.43213
  },
  {
    "code": "49",
    "nameTh": "มุกดาหาร",
    "lat": 16.56794,
    "lng": 104.51029
  },
  {
    "code": "50",
    "nameTh": "เชียงใหม่",
    "lat": 18.79808,
    "lng": 98.72897
  },
  {
    "code": "51",
    "nameTh": "ลำพูน",
    "lat": 18.11186,
    "lng": 98.95305
  },
  {
    "code": "52",
    "nameTh": "ลำปาง",
    "lat": 18.32558,
    "lng": 99.51055
  },
  {
    "code": "53",
    "nameTh": "อุตรดิตถ์",
    "lat": 17.75149,
    "lng": 100.51675
  },
  {
    "code": "54",
    "nameTh": "แพร่",
    "lat": 18.19149,
    "lng": 100.06786
  },
  {
    "code": "55",
    "nameTh": "น่าน",
    "lat": 18.84795,
    "lng": 100.83536
  },
  {
    "code": "56",
    "nameTh": "พะเยา",
    "lat": 19.22699,
    "lng": 100.19354
  },
  {
    "code": "57",
    "nameTh": "เชียงราย",
    "lat": 19.84549,
    "lng": 99.86937
  },
  {
    "code": "58",
    "nameTh": "แม่ฮ่องสอน",
    "lat": 18.81955,
    "lng": 98.03088
  },
  {
    "code": "60",
    "nameTh": "นครสวรรค์",
    "lat": 15.68723,
    "lng": 100.14812
  },
  {
    "code": "61",
    "nameTh": "อุทัยธานี",
    "lat": 15.34604,
    "lng": 99.47738
  },
  {
    "code": "62",
    "nameTh": "กำแพงเพชร",
    "lat": 16.32709,
    "lng": 99.53347
  },
  {
    "code": "63",
    "nameTh": "ตาก",
    "lat": 16.71448,
    "lng": 98.78961
  },
  {
    "code": "64",
    "nameTh": "สุโขทัย",
    "lat": 17.24746,
    "lng": 99.71035
  },
  {
    "code": "65",
    "nameTh": "พิษณุโลก",
    "lat": 16.98001,
    "lng": 100.54148
  },
  {
    "code": "66",
    "nameTh": "พิจิตร",
    "lat": 16.26653,
    "lng": 100.33541
  },
  {
    "code": "67",
    "nameTh": "เพชรบูรณ์",
    "lat": 16.27472,
    "lng": 101.14564
  },
  {
    "code": "70",
    "nameTh": "ราชบุรี",
    "lat": 13.53184,
    "lng": 99.57348
  },
  {
    "code": "71",
    "nameTh": "กาญจนบุรี",
    "lat": 14.59315,
    "lng": 99.04275
  },
  {
    "code": "72",
    "nameTh": "สุพรรณบุรี",
    "lat": 14.61895,
    "lng": 99.88773
  },
  {
    "code": "73",
    "nameTh": "นครปฐม",
    "lat": 13.92547,
    "lng": 100.09635
  },
  {
    "code": "74",
    "nameTh": "สมุทรสาคร",
    "lat": 13.56839,
    "lng": 100.21008
  },
  {
    "code": "75",
    "nameTh": "สมุทรสงคราม",
    "lat": 13.41119,
    "lng": 99.96372
  },
  {
    "code": "76",
    "nameTh": "เพชรบุรี",
    "lat": 12.94563,
    "lng": 99.62098
  },
  {
    "code": "77",
    "nameTh": "ประจวบคีรีขันธ์",
    "lat": 11.9513,
    "lng": 99.63664
  },
  {
    "code": "80",
    "nameTh": "นครศรีธรรมราช",
    "lat": 8.37768,
    "lng": 99.78429
  },
  {
    "code": "81",
    "nameTh": "กระบี่",
    "lat": 8.18597,
    "lng": 99.01144
  },
  {
    "code": "82",
    "nameTh": "พังงา",
    "lat": 8.66659,
    "lng": 98.41857
  },
  {
    "code": "83",
    "nameTh": "ภูเก็ต",
    "lat": 7.9686,
    "lng": 98.34794
  },
  {
    "code": "84",
    "nameTh": "สุราษฎร์ธานี",
    "lat": 9.03818,
    "lng": 99.08031
  },
  {
    "code": "85",
    "nameTh": "ระนอง",
    "lat": 9.95626,
    "lng": 98.69871
  },
  {
    "code": "86",
    "nameTh": "ชุมพร",
    "lat": 10.34867,
    "lng": 99.06539
  },
  {
    "code": "90",
    "nameTh": "สงขลา",
    "lat": 6.92878,
    "lng": 100.55609
  },
  {
    "code": "91",
    "nameTh": "สตูล",
    "lat": 6.86042,
    "lng": 99.95063
  },
  {
    "code": "92",
    "nameTh": "ตรัง",
    "lat": 7.55602,
    "lng": 99.59249
  },
  {
    "code": "93",
    "nameTh": "พัทลุง",
    "lat": 7.51281,
    "lng": 100.07108
  },
  {
    "code": "94",
    "nameTh": "ปัตตานี",
    "lat": 6.72656,
    "lng": 101.3516
  },
  {
    "code": "95",
    "nameTh": "ยะลา",
    "lat": 6.17852,
    "lng": 101.22868
  },
  {
    "code": "96",
    "nameTh": "นราธิวาส",
    "lat": 6.17027,
    "lng": 101.71844
  }
];

export const THAI_PROVINCES: readonly ThaiProvince[] = [
  ...RAW_PROVINCES.filter((p) => p.code === BANGKOK_PROVINCE_CODE),
  ...RAW_PROVINCES.filter((p) => p.code !== BANGKOK_PROVINCE_CODE).sort((a, b) =>
    a.nameTh.localeCompare(b.nameTh, 'th'),
  ),
];

export function provinceByCode(code: string | null | undefined): ThaiProvince | undefined {
  if (!code) return undefined;
  return THAI_PROVINCES.find((p) => p.code === code);
}

export const BANGKOK_CENTER = { lat: 13.7563, lng: 100.5018 } as const;

