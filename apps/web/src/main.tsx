import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { I18nextProvider } from 'react-i18next';
import i18n from './lib/i18n.js';
import { AppShell } from './layout/AppShell';
import { EventDetailPage } from './pages/EventDetailPage';
import { MyPage } from './pages/MyPage';
import { AdminEventsPage } from './pages/AdminEventsPage';
import { UploaderPage } from './pages/UploaderPage';
import { UploaderNewEventPage } from './pages/UploaderNewEventPage';
import { UploaderEventEditPage } from './pages/UploaderEventEditPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { CommunityPage } from './pages/CommunityPage';
import { PostDetailPage } from './pages/PostDetailPage';
import { MateFormPage } from './pages/MateFormPage';
import { MateRecommendationsPage } from './pages/MateRecommendationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChatRequestPage } from './pages/ChatRequestPage';
import { ChatRoomsListPage } from './pages/ChatRoomsListPage';
import { ChatRoomPage } from './pages/ChatRoomPage';
import { EvaluationPage } from './pages/EvaluationPage/index.js';
import { CreditPage } from './pages/CreditPage/index.js';
import { AuthProvider } from './lib/auth-context';
import '@seed-design/css/all.css';
import './styles/index.css';
import './styles/seed-overrides.css';

// NOTE: StrictMode 제거 — react-kakao-maps-sdk 의 MarkerClusterer 가 dev 의
// double-invoke 에서 내부 marker 참조를 null 로 덮어 "Cannot set properties of
// null (setting 'title')" 로 크래시하는 알려진 이슈. 프로덕션 빌드는 영향 없음.
// ErrorBoundary (components/ErrorBoundary.tsx) 가 남은 race 를 캡처한다.

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <I18nextProvider i18n={i18n}>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/me" element={<MyPage />} />
          <Route path="/admin" element={<AdminEventsPage />} />
          <Route path="/uploader" element={<UploaderPage />} />
          <Route path="/uploader/new" element={<UploaderNewEventPage />} />
          <Route path="/uploader/events/:id/edit" element={<UploaderEventEditPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/posts/:id" element={<PostDetailPage />} />
          <Route path="/mate/form" element={<MateFormPage />} />
          <Route path="/mate/recommendations" element={<MateRecommendationsPage />} />
          <Route path="/me/profile" element={<ProfilePage />} />
          {/* 슬라이스3: 채팅 신청 + 채팅방 (A_803/A_804/A_805) */}
          <Route path="/chat/request" element={<ChatRequestPage />} />
          <Route path="/chat/rooms" element={<ChatRoomsListPage />} />
          <Route path="/chat/rooms/:chatRoomId" element={<ChatRoomPage />} />
          {/* 슬라이스5: 평가 (A_900+A_901) + 크레딧 내역 (GG-MY-008/GG-COMM-017) */}
          <Route path="/evaluate/:appointmentId" element={<EvaluationPage />} />
          <Route path="/credits" element={<CreditPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </I18nextProvider>,
);
