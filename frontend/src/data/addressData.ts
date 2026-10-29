export interface ProvinceOption {
  code: string;
  name: string;
}

export interface MunicipalityOption {
  code: string;
  name: string;
  provinceCode: string;
}

export interface BarangayOption {
  code: string;
  name: string;
  municipalityCode: string;
}

/**
 * Built-in canonical Eastern Visayas (Region VIII) Provinces.
 * Biliran is prioritized at index 0 for immediate selection.
 */
export const BUILTIN_PROVINCES: readonly ProvinceOption[] = [
  { code: '0807800000', name: 'Biliran' },
  { code: '0803700000', name: 'Leyte' },
  { code: '0806400000', name: 'Southern Leyte' },
  { code: '0806000000', name: 'Samar' },
  { code: '0802600000', name: 'Eastern Samar' },
  { code: '0804800000', name: 'Northern Samar' },
];

/**
 * Built-in canonical Municipalities for Biliran (all 8 towns) + major Region VIII centers.
 */
export const BUILTIN_MUNICIPALITIES: readonly MunicipalityOption[] = [
  // 8 Official Biliran Municipalities
  { code: '0807801000', name: 'Almeria', provinceCode: '0807800000' },
  { code: '0807802000', name: 'Biliran', provinceCode: '0807800000' },
  { code: '0807803000', name: 'Cabucgayan', provinceCode: '0807800000' },
  { code: '0807804000', name: 'Caibiran', provinceCode: '0807800000' },
  { code: '0807805000', name: 'Culaba', provinceCode: '0807800000' },
  { code: '0807806000', name: 'Kawayan', provinceCode: '0807800000' },
  { code: '0807807000', name: 'Maripipi', provinceCode: '0807800000' },
  { code: '0807808000', name: 'Naval', provinceCode: '0807800000' },

  // Leyte Municipalities / Cities
  { code: '0803747000', name: 'Tacloban City', provinceCode: '0803700000' },
  { code: '0803738000', name: 'Ormoc City', provinceCode: '0803700000' },
  { code: '0803706000', name: 'Baybay City', provinceCode: '0803700000' },
  { code: '0803739000', name: 'Palo', provinceCode: '0803700000' },
  { code: '0803748000', name: 'Tanauan', provinceCode: '0803700000' },
  { code: '0803714000', name: 'Carigara', provinceCode: '0803700000' },

  // Southern Leyte Municipalities / Cities
  { code: '0806407000', name: 'Maasin City', provinceCode: '0806400000' },
  { code: '0806416000', name: 'Sogod', provinceCode: '0806400000' },
  { code: '0806408000', name: 'Macrohon', provinceCode: '0806400000' },

  // Samar Municipalities / Cities
  { code: '0806003000', name: 'Catbalogan City', provinceCode: '0806000000' },
  { code: '0806002000', name: 'Calbayog City', provinceCode: '0806000000' },

  // Eastern Samar Municipalities / Cities
  { code: '0802605000', name: 'Borongan City', provinceCode: '0802600000' },
  { code: '0802608000', name: 'Guiuan', provinceCode: '0802600000' },

  // Northern Samar Municipalities
  { code: '0804805000', name: 'Catarman', provinceCode: '0804800000' },
  { code: '0804810000', name: 'Laoang', provinceCode: '0804800000' },
];

/**
 * Complete official list of Barangays across all 8 Biliran Municipalities.
 * Uses exact official Biliran LGU / PSGC nomenclature.
 */
export const BUILTIN_BILIRAN_BARANGAYS: Record<string, string[]> = {
  Almeria: [
    'Caucab', 'Iyusan', 'Jamorawon', 'Lo-ok', 'Matanga', 'Pili',
    'Poblacion', 'Pulangbato', 'Salangi', 'Sampao', 'Tabunan',
    'Talahid', 'Tamarindo',
  ],
  Biliran: [
    'Bato', 'Burabod', 'Busali', 'Hugpa', 'Julita', 'Canila',
    'Pinangomhan', 'San Isidro', 'San Roque', 'Sanggalang', 'Villa Enage',
  ],
  Cabucgayan: [
    'Balaquid', 'Baso', 'Bunga', 'Caanibongan', 'Casiawan', 'Esperanza',
    'Langgao', 'Libertad', 'Looc', 'Magbangon', 'Pawikan', 'Salawad', 'Talibong',
  ],
  Caibiran: [
    'Alegria', 'Asug', 'Bari-is', 'Binohangan', 'Cabibihan', 'Kawayanon',
    'Looc', 'Manlabang', 'Caulangohan', 'Maurang', 'Palanay', 'Palengke',
    'Tomalistis', 'Union', 'Uson', 'Victory', 'Villa Vicenta',
  ],
  Culaba: [
    'Acaban', 'Bacolod', 'Binongtoan', 'Bool Central', 'Bool East', 'Bool West',
    'Calipayan', 'Guindapunan', 'Habuhab', 'Looc', 'Marvel', 'Patag',
    'Pinamihagan', 'Culaba Central', 'Salvacion', 'San Roque', 'Virginia',
  ],
  Kawayan: [
    'Baganito', 'Balacson', 'Bilwang', 'Bulalacao', 'Burabod', 'Inasuyan',
    'Kansanok', 'Mada-o', 'Mapuyo', 'Masagaosao', 'Masagongsong', 'Palañas',
    'Poblacion', 'San Lorenzo', 'Tabunan North', 'Tubig Guinoo', 'Tucdao',
    'Ungale', 'Villa Cornejo', 'Villa Victor',
  ],
  Maripipi: [
    'Agutay', 'Banlas', 'Bato', 'Binalayan East', 'Binalayan West', 'Binongto-an',
    'Burabod', 'Calbani', 'Canduhao', 'Casibang', 'Danao', 'Ermita',
    'Ol-og', 'Trabugan', 'Viga',
  ],
  Naval: [
    'Agpangi', 'Anislagan', 'Atipolo', 'Borac', 'Cabungaan', 'Calumpang',
    'Capiñahan', 'Caraycaray', 'Catmon', 'Haguikhikan', 'Imelda', 'Larrazabal',
    'Libertad', 'Libtong', 'Lico', 'Lucsoon', 'Mabini',
    'Padre Inocentes Garcia (Pob.)', 'Padre Sergio Eamiguel', 'Sabang',
    'San Pablo', 'Santo Niño', 'Santissimo Rosario Pob.', 'Smo. Rosario',
    'Talustusan', 'Villa Caneja', 'Villa Consuelo',
  ],
};

const MUNICIPALITY_CODE_TO_NAME: Record<string, string> = {
  '0807801000': 'Almeria',
  '0807802000': 'Biliran',
  '0807803000': 'Cabucgayan',
  '0807804000': 'Caibiran',
  '0807805000': 'Culaba',
  '0807806000': 'Kawayan',
  '0807807000': 'Maripipi',
  '0807808000': 'Naval',
};

const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  Biliran: '0807800000',
  Leyte: '0803700000',
  'Southern Leyte': '0806400000',
  Samar: '0806000000',
  'Eastern Samar': '0802600000',
  'Northern Samar': '0804800000',
};

export function getBuiltInProvinces(): ProvinceOption[] {
  return [...BUILTIN_PROVINCES];
}

export function getBuiltInMunicipalities(provinceNameOrCode = 'Biliran'): MunicipalityOption[] {
  const code = PROVINCE_NAME_TO_CODE[provinceNameOrCode] || provinceNameOrCode;
  const filtered = BUILTIN_MUNICIPALITIES.filter((m) => m.provinceCode === code);
  return filtered.length > 0
    ? filtered
    : BUILTIN_MUNICIPALITIES.filter((m) => m.provinceCode === '0807800000');
}

export function getBuiltInBarangays(municipalityNameOrCode: string): BarangayOption[] {
  if (!municipalityNameOrCode) return [];
  const munName = MUNICIPALITY_CODE_TO_NAME[municipalityNameOrCode] || municipalityNameOrCode;
  const munOption = BUILTIN_MUNICIPALITIES.find(
    (m) => m.name.toLowerCase() === munName.toLowerCase() || m.code === municipalityNameOrCode,
  );
  const munCode = munOption ? munOption.code : '0807808000';
  const resolvedName = munOption ? munOption.name : munName;

  const names = BUILTIN_BILIRAN_BARANGAYS[resolvedName] || [];
  return names.map((name, idx) => ({
    code: `${munCode.slice(0, 7)}${String(idx + 1).padStart(3, '0')}`,
    name,
    municipalityCode: munCode,
  }));
}
