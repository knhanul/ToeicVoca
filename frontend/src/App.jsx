import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import StudyPage from "./pages/StudyPage.jsx";
import RemindPage from "./pages/RemindPage.jsx";

function App() {
  return (
    <BrowserRouter basename="/voca">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/study" element={<StudyPage />} />
        <Route path="/remind" element={<RemindPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
