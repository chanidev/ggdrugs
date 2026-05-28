#!/usr/bin/env node
/**
 * SeoulMap.tsx 의 매칭 알고리즘을 동일하게 구현해 DB regions ↔ GeoJSON features
 * 매칭 커버리지 측정. 1회용 검증 도구.
 *
 * 매칭 룰:
 *  1. exact: (sido, sigungu_normalized) === (codeMap[code[0:2]], feature.name)
 *  2. 시 단위 prefix fallback: sigungu 가 "...시" 로 끝나고 feature.name 이 그것으로 시작 → 자치구 합집합
 */
import { readFileSync } from 'node:fs';

const SIDO_CODE_MAP = {
  '11': '서울', '21': '부산', '22': '대구', '23': '인천', '24': '광주',
  '25': '대전', '26': '울산', '29': '세종', '31': '경기', '32': '강원',
  '33': '충북', '34': '충남', '35': '전북', '36': '전남', '37': '경북',
  '38': '경남', '39': '제주',
};
const SIDO_CODE_OVERRIDE = { '37310': '대구' }; // 군위군 2023-07 편입

const geojsonPath = process.argv[2] ?? 'apps/web/public/data/skorea-municipalities.geojson';
const geojson = JSON.parse(readFileSync(geojsonPath, 'utf8'));

const regionsResp = await fetch('http://localhost:3000/regions');
const regions = (await regionsResp.json()).items.filter((r) => r.sigungu !== null);

const normalize = (s) => (s ? s.replace(/\s+/g, '') : '');

let matched = 0;
const unmatched = [];
for (const r of regions) {
  const key = normalize(r.sigungu);
  const hit = geojson.features.find((f) => {
    const featureSido = SIDO_CODE_OVERRIDE[f.properties.code] ?? SIDO_CODE_MAP[f.properties.code.slice(0, 2)];
    if (featureSido !== r.sido) return false;
    const name = f.properties.name;
    if (name === key) return true;
    if (key.endsWith('시') && name.startsWith(key) && name !== key) return true;
    return false;
  });
  if (hit) matched++;
  else unmatched.push(`${r.sido}/${r.sigungu}`);
}

console.log(`Total DB sigungu rows: ${regions.length}`);
console.log(`GeoJSON features: ${geojson.features.length}`);
console.log(`Matched: ${matched} (${((matched/regions.length)*100).toFixed(1)}%)`);
console.log(`Unmatched: ${unmatched.length}`);
if (unmatched.length > 0) {
  console.log('--- unmatched DB sigungu ---');
  unmatched.forEach((s) => console.log(`  ${s}`));
}
