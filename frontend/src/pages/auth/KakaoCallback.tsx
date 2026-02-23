import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const KakaoCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // 백엔드에서 쿠키와 localStorage에 isLogin을 저장
        // 여기서는 로그인 상태 확인 API 호출
        const response = await fetch("http://localhost:8001/api/auth/kakao/me", {
          method: "GET",
          credentials: "include", // 쿠키 포함
        });

        const data = await response.json();

        if (data.isLoggedIn && data.user) {
          // 로그인 성공 - 토큰 및 사용자 정보 저장
          login(data.user.id.toString(), data.user);

          // signup=true이면 회원가입 완료 페이지 또는 안내 표시 가능
          const isSignup = searchParams.get("signup");
          if (isSignup === "true") {
            console.log("새로운 사용자 가입 완료");
          }

          // 메인 페이지로 이동
          setTimeout(() => {
            navigate("/");
          }, 500);
        } else {
          // 로그인 실패
          console.error("로그인 실패");
          setTimeout(() => {
            navigate("/login?error=login_failed");
          }, 1000);
        }
      } catch (error) {
        console.error("카카오 콜백 처리 중 오류:", error);
        setTimeout(() => {
          navigate("/login?error=callback_error");
        }, 1000);
      }
    };

    handleCallback();
  }, [navigate, login, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
        <h2 className="text-xl font-semibold mb-2">카카오 로그인 처리 중...</h2>
        <p className="text-muted-foreground">잠깐만 기다려주세요.</p>
      </div>
    </div>
  );
};

export default KakaoCallback;
