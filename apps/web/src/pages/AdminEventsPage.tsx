// Re-export shim — AdminEventsPage 는 ./AdminEventsPage/ 디렉터리로 분할되어 있다.
// Vite 가 directory-as-index 자동 resolve 안 하므로 router (main.tsx) 무수정 보장 위해 유지.
export { AdminEventsPage } from './AdminEventsPage/index';
