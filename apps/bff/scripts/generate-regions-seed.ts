// apps/bff/scripts/generate-regions-seed.ts
/**
 * 전국 시/도 + 시/군/구 시드 SQL 생성기. 1회용.
 * 출력: stdout → 운영자가 마이그레이션 파일에 paste.
 *
 * 명명 규칙:
 *   - sido_name: 단축형 ("서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주")
 *   - sigungu_name:
 *     - 광역시 자치구: 단순 ("해운대구")
 *     - 일반시·군: 단순 ("수원시","안동시","양양군")
 *     - 자치구 있는 일반시 자치구: 합성형 ("수원시 영통구")
 *
 * 자치구 있는 일반시: 수원·성남·고양·용인·청주·천안·전주·포항 — 시 단위 row 도 동시 INSERT.
 */

import { writeFileSync } from 'node:fs';

interface SidoSpec {
  sido: string;
  fullAddr: string; // full_address 컬럼
  sigungu: string[]; // 단순/합성형 그대로
}

const NATIONWIDE: SidoSpec[] = [
  // 서울 — 기존 시드 (마이그레이션 20260418140000) 에 이미 있음. 본 스크립트에서는 누락 검증용으로만 출력.
  {
    sido: '서울',
    fullAddr: '서울특별시',
    sigungu: [
      // 25개 자치구 (기존 시드와 일치) — INSERT IGNORE 또는 ON CONFLICT 회피 위해 본 마이그레이션에서는 emit 하지 않음
    ],
  },
  {
    sido: '부산',
    fullAddr: '부산광역시',
    sigungu: [
      '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구',
      '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군',
    ],
  },
  {
    sido: '대구',
    fullAddr: '대구광역시',
    sigungu: ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'],
  },
  {
    sido: '인천',
    fullAddr: '인천광역시',
    sigungu: ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
  },
  {
    sido: '광주',
    fullAddr: '광주광역시',
    sigungu: ['동구', '서구', '남구', '북구', '광산구'],
  },
  {
    sido: '대전',
    fullAddr: '대전광역시',
    sigungu: ['동구', '중구', '서구', '유성구', '대덕구'],
  },
  {
    sido: '울산',
    fullAddr: '울산광역시',
    sigungu: ['중구', '남구', '동구', '북구', '울주군'],
  },
  {
    sido: '세종',
    fullAddr: '세종특별자치시',
    sigungu: [], // 단일 자치시 — 광역 row 만
  },
  {
    sido: '경기',
    fullAddr: '경기도',
    sigungu: [
      // 일반시·군 (자치구 없음)
      '의정부시', '동두천시', '안양시', '광명시', '평택시', '오산시', '시흥시', '군포시', '의왕시', '하남시',
      '이천시', '안성시', '김포시', '양주시', '구리시', '남양주시', '포천시', '여주시', '연천군', '가평군', '양평군',
      '과천시', '광주시',
      // 자치구 있는 일반시 — 시 단위 row + 자치구 합성형
      '수원시', '수원시 장안구', '수원시 권선구', '수원시 팔달구', '수원시 영통구',
      '성남시', '성남시 수정구', '성남시 중원구', '성남시 분당구',
      '고양시', '고양시 덕양구', '고양시 일산동구', '고양시 일산서구',
      '용인시', '용인시 처인구', '용인시 기흥구', '용인시 수지구',
      '안산시', '안산시 상록구', '안산시 단원구', // 안산은 자치구 시 — 10개 시 list 에 포함
      '부천시', // 자치구 폐지(2016) — 단일 row
      '화성시',
    ],
  },
  {
    sido: '강원',
    fullAddr: '강원특별자치도',
    sigungu: [
      '춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시',
      '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군',
    ],
  },
  {
    sido: '충북',
    fullAddr: '충청북도',
    sigungu: [
      '청주시', '청주시 상당구', '청주시 서원구', '청주시 흥덕구', '청주시 청원구',
      '충주시', '제천시',
      '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군',
    ],
  },
  {
    sido: '충남',
    fullAddr: '충청남도',
    sigungu: [
      '천안시', '천안시 동남구', '천안시 서북구',
      '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시',
      '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군',
    ],
  },
  {
    sido: '전북',
    fullAddr: '전북특별자치도',
    sigungu: [
      '전주시', '전주시 완산구', '전주시 덕진구',
      '군산시', '익산시', '정읍시', '남원시', '김제시',
      '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군',
    ],
  },
  {
    sido: '전남',
    fullAddr: '전라남도',
    sigungu: [
      '목포시', '여수시', '순천시', '나주시', '광양시',
      '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군',
      '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군',
    ],
  },
  {
    sido: '경북',
    fullAddr: '경상북도',
    sigungu: [
      '포항시', '포항시 남구', '포항시 북구',
      '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시',
      '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군',
    ],
  },
  {
    sido: '경남',
    fullAddr: '경상남도',
    sigungu: [
      '창원시', '창원시 의창구', '창원시 성산구', '창원시 마산합포구', '창원시 마산회원구', '창원시 진해구',
      '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시',
      '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군',
    ],
  },
  {
    sido: '제주',
    fullAddr: '제주특별자치도',
    sigungu: ['제주시', '서귀포시'],
  },
];

function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

function emit(): string {
  const lines: string[] = [];
  lines.push('-- 전국 시/도 + 시/군/구 시드 (ADR 0006).');
  lines.push("-- 광역시·도 17행 중 서울/부산/대구/인천/광주/대전/울산/경기 8행은 기존 시드 (20260418140000) 에 있어 생략.");
  lines.push('-- 신규 광역 row: 세종, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주 (9행).');
  lines.push("-- 신규 시/군/구 row: 위 모든 시도의 sigungu (서울 25구 제외).");
  lines.push('');
  lines.push('INSERT INTO regions (sido_name, sigungu_name, dong_name, full_address) VALUES');

  const rows: string[] = [];
  for (const s of NATIONWIDE) {
    // 광역 row (서울/부산/대구/인천/광주/대전/울산/경기 8개는 기존 시드에 있음 — skip)
    const sidoExists = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '경기'].includes(s.sido);
    if (!sidoExists) {
      rows.push(`  ('${escSql(s.sido)}', NULL, NULL, '${escSql(s.fullAddr)}')`);
    }
    // sigungu rows (서울 25구 제외, 위에서 sigungu: [] 라 자동 skip)
    for (const sg of s.sigungu) {
      rows.push(`  ('${escSql(s.sido)}', '${escSql(sg)}', NULL, '${escSql(s.fullAddr)} ${escSql(sg)}')`);
    }
  }
  lines.push(rows.join(',\n') + ';');
  lines.push('');
  lines.push('-- 검증 쿼리:');
  lines.push('--   SELECT sido_name, COUNT(*) FROM regions GROUP BY sido_name ORDER BY sido_name;');
  lines.push('--   SELECT COUNT(*) FROM regions WHERE dong_name IS NULL;  -- 약 250');
  return lines.join('\n');
}

const outPath = process.argv[2];
if (!outPath) {
  console.error('Usage: tsx generate-regions-seed.ts <output-path>');
  process.exit(2);
}
writeFileSync(outPath, emit() + '\n', 'utf8');
console.error(`Wrote ${outPath}`);
