import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ScreenRecordingProvider } from './context/ScreenRecordingContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SplashScreen } from './components/SplashScreen';
import { HomePage } from './pages/Home';
import { ProfilePage } from './pages/Profile';
import { BlitzGame } from './pages/BlitzGame';
import { MillionaireGame } from './pages/MillionaireGame';
import { OneHundredToOneGame } from './pages/OneHundredToOneGame';
import { WhatWhereWhenGame } from './pages/WhatWhereWhenGame';
import { MelodyGame } from './pages/MelodyGame';
import { RatingPage } from './pages/Rating';
import { PublicProfilePage } from './pages/PublicProfile';
import { JeopardyGame } from './pages/JeopardyGame';
import { BlogPage } from './pages/Blog';
import { BlogPostPage } from './pages/BlogPost';
import { GameCreationPage } from './pages/GameCreation';
import { BrowserLoginPage } from './pages/BrowserLogin';
import { PostRegistrationPage } from './pages/PostRegistration';
import { SystemAdminPage } from './pages/SystemAdminPage';
import { FreeGamesPage } from './pages/FreeGames';
import { MultiplayerRoomPage } from './pages/MultiplayerRoomPage';
import { OfertaPage } from './pages/OfertaPage';
import { PaymentResultPage } from './pages/PaymentResultPage';

function AppRoutes() {
  const { loading, profile, entryMode } = useAuth();
  const location = useLocation();
  const [isCacheReady, setIsCacheReady] = React.useState(false);

  React.useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      sessionStorage.setItem('pending_ref', ref);
      localStorage.setItem('pending_ref', ref);
    }
  }, []);

  if (loading || !isCacheReady) {
    return <SplashScreen onComplete={() => setIsCacheReady(true)} />;
  }

  // Handle direct /profile<uid> links without slash (e.g. /profile53391177256)
  const profileNoSlashMatch = location.pathname.match(/^\/profile([0-9a-zA-Z_-]+)$/i);
  if (profileNoSlashMatch) {
    const sub = profileNoSlashMatch[1].toLowerCase();
    const reserved = ['trans', 'ref', 'history', 'edit', 'notifications', 'exchange', 'multiplayer', 'lobby'];
    if (!reserved.includes(sub)) {
      return <Navigate to={`/profile/${profileNoSlashMatch[1]}`} replace />;
    }
  }

  // Handle deep link /chat-<chatId>-mes<msgId> or /chat-<chatId>
  const chatDeepLinkMatch = location.pathname.match(/^\/chat-([a-zA-Z0-9_-]+?)(?:-mes([a-zA-Z0-9_-]+))?$/i);
  if (chatDeepLinkMatch) {
    const targetChatId = chatDeepLinkMatch[1];
    const targetMesId = chatDeepLinkMatch[2] || '';
    sessionStorage.setItem('open_chat_id', targetChatId);
    if (targetMesId) {
      sessionStorage.setItem('open_chat_mes_id', targetMesId);
    }
    return <Navigate to={`/profile/ref?chat=${targetChatId}${targetMesId ? `&mes=${targetMesId}` : ''}`} replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<BrowserLoginPage />} />
        <Route path="/post-registration" element={<PostRegistrationPage />} />
        <Route path="/oferta" element={<OfertaPage />} />
        <Route path="/payment/success" element={<PaymentResultPage mode="success" />} />
        <Route path="/payment/fail" element={<PaymentResultPage mode="fail" />} />
        <Route path="/payment/info" element={<PaymentResultPage mode="info" />} />
        <Route path="/payment/rules" element={<PaymentResultPage mode="info" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/trans" element={<ProfilePage />} />
        <Route path="/profile/ref" element={<ProfilePage />} />
        <Route path="/profile/history" element={<ProfilePage />} />
        <Route path="/profile/multiplayer" element={<ProfilePage />} />
        <Route path="/profile/lobby" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<ProfilePage />} />
        <Route path="/profile/notifications" element={<ProfilePage />} />
        <Route path="/profile/exchange" element={<ProfilePage />} />
        <Route path="/profile/:uid" element={<PublicProfilePage />} />
        <Route path="/profile:uid" element={<PublicProfilePage />} />
        <Route path="/games" element={<Navigate to="/" replace />} />
        <Route path="/multiplayer" element={<Navigate to={`/profile/multiplayer${location.search}`} replace />} />
        <Route
          path="/zoom"
          element={(() => {
            const sp = new URLSearchParams(location.search);
            const rParam = sp.get('room') || '';
            const tParam = sp.get('type') || '';
            const cleanRoom = rParam.replace(/^room_/, '');
            if (cleanRoom.startsWith('mproom_') || ['blitz', '100to1', 'jeopardy'].includes(tParam)) {
              return <Navigate to={`/multiplayer/room/${cleanRoom}`} replace />;
            }
            return <Navigate to={`/profile/multiplayer${location.search}`} replace />;
          })()}
        />
        <Route path="/multiplayer/room/:roomId" element={<MultiplayerRoomPage />} />
        <Route path="/free" element={<FreeGamesPage />} />
        <Route path="/free/:packId" element={<FreeGamesPage />} />
        <Route path="/game/blitz" element={<BlitzGame />} />
        <Route path="/blitz" element={<BlitzGame />} />
        <Route path="/game/millionaire" element={<MillionaireGame />} />
        <Route path="/millionaire" element={<MillionaireGame />} />
        <Route path="/game/100to1" element={<OneHundredToOneGame />} />
        <Route path="/100to1" element={<OneHundredToOneGame />} />
        <Route path="/game/whatwherewhen" element={<WhatWhereWhenGame />} />
        <Route path="/whatwherewhen" element={<WhatWhereWhenGame />} />
        <Route path="/game/melody" element={<MelodyGame />} />
        <Route path="/melody" element={<MelodyGame />} />
        <Route path="/game/jeopardy" element={<JeopardyGame />} />
        <Route path="/jeopardy" element={<JeopardyGame />} />
        <Route path="/game/create" element={<GameCreationPage />} />
        <Route path="/admin" element={<Navigate to="/system-admin" replace />} />
        <Route path="/system-admin" element={<SystemAdminPage />} />
        <Route path="/system-admin/robokassa" element={<SystemAdminPage />} />
        <Route path="/system-admin/crm" element={<SystemAdminPage />} />
        <Route path="/system-admin/scoring" element={<SystemAdminPage />} />
        <Route path="/system-admin/telegram" element={<SystemAdminPage />} />
        <Route path="/system-admin/proxy" element={<SystemAdminPage />} />
        <Route path="/system-admin/triggers" element={<SystemAdminPage />} />
        <Route path="/system-admin/cron" element={<SystemAdminPage />} />
        <Route path="/system-admin/files" element={<SystemAdminPage />} />
        <Route path="/system-admin/audio" element={<SystemAdminPage />} />
        <Route path="/system-admin/moderation" element={<SystemAdminPage />} />
        <Route path="/system-admin/prompts" element={<SystemAdminPage />} />
        <Route path="/system-admin/blog" element={<SystemAdminPage />} />
        <Route path="/system-admin/posts" element={<SystemAdminPage />} />
        <Route path="/system-admin/logs" element={<SystemAdminPage />} />
        <Route path="/cart" element={<Navigate to="/profile/exchange" replace />} />
        <Route path="/social" element={<Navigate to="/" replace />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/news" element={<Navigate to="/blog" replace />} />
        <Route path="/rating" element={<RatingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <CartProvider>
              <ScreenRecordingProvider>
                <AppRoutes />
              </ScreenRecordingProvider>
            </CartProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
