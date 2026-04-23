/**
 * Re-export shim — 라우트 모듈은 `./uploader/` 디렉터리로 분할되어 있다.
 *
 * Node ESM 과 TypeScript `moduleResolution: bundler` 모두 디렉터리 자동 해석을
 * 보장하지 않으므로, `app.ts` 가 변경 없이 `from './routes/uploader.js'` 를
 * 계속 사용할 수 있도록 이 얇은 barrel 을 유지한다.
 *
 * 실제 구현 — handler / helper 는 `./uploader/index.ts` 와 그 sibling 모듈에 있다.
 */

export * from './uploader/index.js';
