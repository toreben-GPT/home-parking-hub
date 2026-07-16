import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LoadingView } from "./components/Feedback";
import { useAuth } from "./contexts/auth-context";
import { AccessPage } from "./pages/AccessPage";
import { DataPage } from "./pages/DataPage";
import { DetailPage } from "./pages/DetailPage";
import { EditPage } from "./pages/EditPage";
import { HomePage } from "./pages/HomePage";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export function App() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <main className="screen screen--centered">
        <LoadingView label="安全な接続を確認しています" />
      </main>
    );
  }

  if (status === "unauthenticated") {
    return <AccessPage />;
  }

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/parking/new" element={<EditPage mode="create" />} />
        <Route path="/parking/:parkingId" element={<DetailPage />} />
        <Route path="/parking/:parkingId/edit" element={<EditPage mode="edit" />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
