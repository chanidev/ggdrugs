#!/usr/bin/env node
/**
 * GeoJSON 단순화 — 좌표 자릿수 5자리 round (~100m 정밀도) + properties 최소화.
 * 원본 18MB → 출력 2-4MB 예상.
 *
 * 사용: node apps/web/scripts/simplify-geojson.mjs <input> <output>
 *
 * 1회용. 결과물은 public/data/skorea-municipalities.geojson 에 commit.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node simplify-geojson.mjs <input> <output>');
  process.exit(2);
}

const round = (n) => Math.round(n * 10000) / 10000; // 4자리 (~10m)
const SAMPLE_STRIDE = 3; // 매 3점마다 1점 유지 (행정구역 highlight 용도 충분 정밀도)

function isLngLat(v) {
  return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function isRing(v) {
  return Array.isArray(v) && v.length > 0 && isLngLat(v[0]);
}

function sampleRing(ring) {
  if (ring.length <= 8) return ring.map(([lng, lat]) => [round(lng), round(lat)]);
  const out = [];
  for (let i = 0; i < ring.length; i += SAMPLE_STRIDE) {
    out.push([round(ring[i][0]), round(ring[i][1])]);
  }
  // closed ring 보장
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  return out;
}

function simplifyCoords(coords) {
  if (isRing(coords)) return sampleRing(coords);
  return coords.map(simplifyCoords);
}

const raw = readFileSync(inPath, 'utf8');
const data = JSON.parse(raw);

if (data.type !== 'FeatureCollection') throw new Error('Expected FeatureCollection');

let dropped = 0;
const features = [];
for (const f of data.features) {
  const code = f.properties?.code;
  const name = f.properties?.name;
  if (!code || !name) {
    dropped++;
    continue;
  }
  features.push({
    type: 'Feature',
    properties: { code, name },
    geometry: {
      type: f.geometry.type,
      coordinates: simplifyCoords(f.geometry.coordinates),
    },
  });
}

const out = { type: 'FeatureCollection', features };
const serialized = JSON.stringify(out);
writeFileSync(outPath, serialized, 'utf8');

console.log(`features: ${features.length} (dropped ${dropped})`);
console.log(`output: ${outPath} (${(serialized.length / 1024 / 1024).toFixed(2)} MB)`);
