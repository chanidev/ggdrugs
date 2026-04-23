// Re-export shim — 모듈은 ./api/ 디렉터리로 분할되어 있다.
// Vite 가 directory-as-index 자동 resolve 안 하므로 caller 무수정 보장 위해 유지.
// 실제 구현은 ./api/index.ts + 그 sibling 모듈에 있다.
export * from './api/index';
