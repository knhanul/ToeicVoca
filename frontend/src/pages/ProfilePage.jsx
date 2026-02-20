import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Mail, Lock, Eye, EyeOff, Check, X, ArrowLeft, Home, BookOpen, History, LogOut } from "lucide-react";

const API_BASE = "/api";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const navigate = useNavigate();

  // Profile form states
  const [email, setEmail] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");

  // Password form states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Message states
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // success, error

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      const storedUser = localStorage.getItem("user");
      console.log("DEBUG localStorage user:", storedUser);
      
      if (!storedUser) {
        console.log("DEBUG: No user in localStorage, redirecting to login");
        navigate("/login");
        return;
      }

      const userData = JSON.parse(storedUser);
      console.log("DEBUG parsed user data:", userData);
      console.log("DEBUG user keys:", Object.keys(userData));
      console.log("DEBUG user.email:", userData.email);
      console.log("DEBUG user.created_at:", userData.created_at);
      
      // 최소한의 데이터만 확인 (id와 username만 있어도 접근 가능)
      if (!userData.id || !userData.username) {
        console.log("DEBUG: Essential user data missing, clearing localStorage");
        localStorage.removeItem("user");
        navigate("/login");
        return;
      }
      
      setUser(userData);
      
      // 이메일이 없으면 기본값 사용
      const emailValue = userData.email || `${userData.username}@example.com`;
      console.log("DEBUG setting currentEmail to:", emailValue);
      setCurrentEmail(emailValue);
      setEmail(emailValue);
    } catch (error) {
      console.error("Failed to load user profile:", error);
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3000);
  };

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleEmailUpdate = async (e) => {
    e.preventDefault();
    
    if (!validateEmail(email)) {
      showMessage("유효한 이메일 주소를 입력해주세요.", "error");
      return;
    }

    const currentEmailValue = user.email || `${user.username}@example.com`;
    if (email === currentEmailValue) {
      showMessage("이메일 주소가 변경되지 않았습니다.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/user/update-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          new_email: email,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentEmail(email);
        showMessage("이메일 주소가 성공적으로 변경되었습니다.", "success");
      } else {
        showMessage(data.detail || "이메일 변경에 실패했습니다.", "error");
      }
    } catch (error) {
      console.error("Email update error:", error);
      showMessage("이메일 변경 중 오류가 발생했습니다.", "error");
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage("모든 비밀번호 필드를 입력해주세요.", "error");
      return;
    }

    if (newPassword.length < 6) {
      showMessage("새 비밀번호는 최소 6자 이상이어야 합니다.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("새 비밀번호가 확인란과 일치하지 않습니다.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/user/update-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showMessage("비밀번호가 성공적으로 변경되었습니다.", "success");
        // Clear password fields
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        showMessage(data.detail || "비밀번호 변경에 실패했습니다.", "error");
      }
    } catch (error) {
      console.error("Password update error:", error);
      showMessage("비밀번호 변경 중 오류가 발생했습니다.", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">프로필 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">사용자 정보를 찾을 수 없습니다.</p>
          <button
            onClick={() => navigate("/login")}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            로그인 페이지로 이동
          </button>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("selectedDifficultyLevel");
    localStorage.removeItem("excludePerfect");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24">
      {/* 1. 상단 헤더: 사용자 정보와 현재 상태 */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 backdrop-blur-md px-4 sm:px-6 py-4 sm:py-6 border-b border-blue-500/20 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-3 bg-white/20 rounded-xl shadow-sm border border-white/30 backdrop-blur-sm hover:bg-white/30 transition-all"
            >
              <ArrowLeft size={20} className="text-white" />
            </button>
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-white to-blue-50 flex items-center justify-center shadow-lg border-2 border-white/30 shrink-0">
                <User size={20} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-xl font-bold text-white truncate">{user.username || '학습자'} 님</div>
                <div className="text-xs sm:text-sm text-blue-100 font-medium whitespace-nowrap">프로필 설정</div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 shrink-0">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/20 rounded-xl shadow-sm border border-white/30 backdrop-blur-sm hover:bg-white/30 transition-all text-white font-medium"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 mt-6">

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-2xl flex items-center backdrop-blur-sm border ${
              messageType === "success"
                ? "bg-green-100/90 text-green-800 border-green-200"
                : "bg-red-100/90 text-red-800 border-red-200"
            }`}
          >
            {messageType === "success" ? (
              <Check className="w-5 h-5 mr-3" />
            ) : (
              <X className="w-5 h-5 mr-3" />
            )}
            <span className="font-medium">{message}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-sm border border-gray-100 mb-4 sm:mb-6">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center text-sm sm:text-base font-medium transition-all rounded-tl-3xl ${
                activeTab === "profile"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              <User className="w-4 h-4 sm:w-5 sm:h-5 inline mr-1 sm:mr-2" />
              <span className="hidden sm:inline">프로필 정보</span>
              <span className="sm:hidden">프로필</span>
            </button>
            <button
              onClick={() => setActiveTab("email")}
              className={`flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center text-sm sm:text-base font-medium transition-all ${
                activeTab === "email"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 inline mr-1 sm:mr-2" />
              <span className="hidden sm:inline">이메일 변경</span>
              <span className="sm:hidden">이메일</span>
            </button>
            <button
              onClick={() => setActiveTab("password")}
              className={`flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center text-sm sm:text-base font-medium transition-all rounded-tr-3xl ${
                activeTab === "password"
                  ? "text-blue-600 bg-blue-50 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              <Lock className="w-4 h-4 sm:w-5 sm:h-5 inline mr-1 sm:mr-2" />
              <span className="hidden sm:inline">비밀번호 변경</span>
              <span className="sm:hidden">비밀번호</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4 sm:p-6">
            {/* Profile Tab */}
            {activeTab === "profile" && (
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                <div className="flex items-center justify-center mb-6 sm:mb-8">
                  <div className="w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl sm:text-4xl font-bold shadow-xl border-4 border-white">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                </div>
                
                <div className="space-y-3 sm:space-y-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-5 rounded-2xl border border-blue-100">
                    <label className="block text-xs sm:text-sm font-bold text-blue-800 mb-1 sm:mb-2">
                      사용자 이름
                    </label>
                    <div className="flex items-center text-gray-900">
                      <User className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 text-blue-600" />
                      <span className="text-sm sm:text-lg font-medium truncate">{user.username}</span>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 sm:p-5 rounded-2xl border border-green-100">
                    <label className="block text-xs sm:text-sm font-bold text-green-800 mb-1 sm:mb-2">
                      현재 이메일 주소
                    </label>
                    <div className="flex items-center text-gray-900">
                      <Mail className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 text-green-600" />
                      <span className="text-sm sm:text-lg font-medium break-all">{user.email || `${user.username}@example.com`}</span>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-3 sm:p-5 rounded-2xl border border-purple-100">
                    <label className="block text-xs sm:text-sm font-bold text-purple-800 mb-1 sm:mb-2">
                      계정 생성일
                    </label>
                    <div className="text-gray-900 text-sm sm:text-lg font-medium">
                      {(() => {
                        console.log("DEBUG created_at:", user.created_at, typeof user.created_at);
                        if (!user.created_at) {
                          return "정보 없음";
                        }
                        
                        try {
                          let date;
                          
                          // PostgreSQL timestamp 형식 처리 (2026-02-18 02:24:52.319 +0900)
                          if (typeof user.created_at === 'string') {
                            // 공백을 T로 변경하고 타임존 정보 정리
                            const cleaned = user.created_at.replace(' ', 'T').replace(' ', '');
                            date = new Date(cleaned);
                            
                            // 그래도 안되면 ISO 형식으로 변환 시도
                            if (isNaN(date.getTime())) {
                              const isoString = user.created_at.replace(' ', 'T') + 'Z';
                              date = new Date(isoString);
                            }
                            
                            // 마지막으로 수동 파싱 시도
                            if (isNaN(date.getTime())) {
                              const match = user.created_at.match(/(\d{4})-(\d{2})-(\d{2})/);
                              if (match) {
                                date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                              }
                            }
                          } else {
                            date = new Date(user.created_at);
                          }
                          
                          console.log("DEBUG date object:", date, isNaN(date.getTime()));
                          
                          // 유효한 날짜인지 확인
                          if (isNaN(date.getTime())) {
                            return "정보 없음";
                          }
                          
                          const formatted = date.toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          });
                          console.log("DEBUG formatted:", formatted);
                          return formatted;
                        } catch (error) {
                          console.log("DEBUG error:", error);
                          return "정보 없음";
                        }
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Email Tab */}
            {activeTab === "email" && (
              <form onSubmit={handleEmailUpdate} className="space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    현재 이메일 주소
                  </label>
                  <div className="bg-gray-50 p-2 sm:p-3 rounded-lg text-gray-900 text-sm sm:text-base break-all">
                    {user.email || `${user.username}@example.com`}
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    새 이메일 주소
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 sm:pl-10 pr-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="새 이메일 주소 입력"
                      required
                    />
                  </div>
                </div>
                
                <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-blue-800">
                    <strong>주의:</strong> 이메일 주소를 변경하면 로그인에 사용하는 이메일도 변경됩니다.
                  </p>
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 sm:py-4 rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all text-sm sm:text-base font-medium shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                >
                  이메일 주소 변경
                </button>
              </form>
            )}

            {/* Password Tab */}
            {activeTab === "password" && (
              <form onSubmit={handlePasswordUpdate} className="space-y-4 sm:space-y-6">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    현재 비밀번호
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full pl-9 sm:pl-10 pr-10 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="현재 비밀번호 입력"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    새 비밀번호
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-9 sm:pl-10 pr-10 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="새 비밀번호 입력 (최소 6자)"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    새 비밀번호 확인
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 sm:pl-10 pr-10 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="새 비밀번호 다시 입력"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </div>
                
                {confirmPassword && newPassword !== confirmPassword && (
                  <div className="bg-red-50 p-2 sm:p-3 rounded-lg text-red-800 text-xs sm:text-sm">
                    비밀번호가 일치하지 않습니다.
                  </div>
                )}
                
                <div className="bg-yellow-50 p-3 sm:p-4 rounded-lg">
                  <p className="text-xs sm:text-sm text-yellow-800">
                    <strong>보안 팁:</strong> 안전한 비밀번호는 문자, 숫자, 특수문자를 조합하여 6자 이상으로 만드세요.
                  </p>
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 sm:py-4 rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all text-sm sm:text-base font-medium shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                >
                  비밀번호 변경
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* iOS 스타일 하단 네비게이션 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex justify-around">
          <button 
            onClick={() => navigate("/dashboard")}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <Home size={18} sm:size={20} />
            <span className="text-xs font-medium">홈</span>
          </button>
          <button 
            onClick={() => navigate("/study")}
            className="flex flex-col items-center gap-1 text-gray-400"
          >
            <BookOpen size={18} sm:size={20} />
            <span className="text-xs font-medium">학습</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-blue-600">
            <User size={18} sm:size={20} />
            <span className="text-xs font-bold">프로필</span>
          </button>
        </div>
      </div>
    </div>
  );
}
