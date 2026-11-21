import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./features/auth/RequireAuth";
import { LoginPage } from "./features/auth/LoginPage";
import { AnalyticsPage } from "./features/app/AnalyticsPage";
import { AppShell } from "./features/app/AppShell";
import { CalendarPage } from "./features/app/CalendarPage";
import { SettingsPage } from "./features/app/SettingsPage";
import { TodayPage } from "./features/app/TodayPage";
import { OnboardingPage } from "./features/app/OnboardingPage";
import { LandingPage } from "./features/landing/LandingPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<TodayPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
