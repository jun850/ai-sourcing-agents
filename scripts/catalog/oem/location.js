'use strict';

const LOCATION_RULES = [
  [/愛知県名古屋市/u, 'Japan', 'Nagoya'],
  [/滋賀県彦根市/u, 'Japan', 'Hikone'],
  [/大阪府吹田市/u, 'Japan', 'Suita'],
  [/東京都八王子市/u, 'Japan', 'Hachioji'],
  [/新潟県新発田市/u, 'Japan', 'Shibata'],
  [/埼玉県さいたま市/u, 'Japan', 'Saitama'],
  [/香川県さぬき市/u, 'Japan', 'Sanuki'],
  [/京都府長岡京市/u, 'Japan', 'Nagaokakyo'],
  [/京都府京都市/u, 'Japan', 'Kyoto'],
  [/大阪府大阪市/u, 'Japan', 'Osaka'],
  [/広島県尾道市/u, 'Japan', 'Onomichi'],
  [/沖縄県浦添市/u, 'Japan', 'Urasoe'],
  [/千葉県習志野市/u, 'Japan', 'Narashino'],
  [/神奈川県横浜市/u, 'Japan', 'Yokohama'],
  [/岡山県岡山市/u, 'Japan', 'Okayama'],
  [/東京都(?:大田|目黒|北|渋谷|板橋|墨田|新宿)区/u, 'Japan', 'Tokyo'],
  [/(?:Tokyo, Japan|Japan, Tokyo)/iu, 'Japan', 'Tokyo'],
  [/(?:서울|Seoul)/iu, 'South Korea', 'Seoul'],
  [/(?:Jiangsu|Wujiang|Suzhou)/iu, 'China', 'Suzhou'],
  [/(?:Haryana|Gurugram)/iu, 'India', 'Gurugram'],
  [/(?:Narayanganj|Fatullah)/iu, 'Bangladesh', 'Narayanganj'],
  [/(?:Dhaka|Baridhara)/iu, 'Bangladesh', 'Dhaka'],
  [/(?:Punjab|Sialkot)/iu, 'Pakistan', 'Sialkot'],
  [/(?:Galle|Wanduramba)/iu, 'Sri Lanka', 'Galle'],
];

function normalizeSupplierLocation(address) {
  const source = String(address || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!source) return { country: null, city: null };
  const match = LOCATION_RULES.find(([pattern]) => pattern.test(source));
  return match ? { country: match[1], city: match[2] } : { country: null, city: null };
}

module.exports = { normalizeSupplierLocation };
