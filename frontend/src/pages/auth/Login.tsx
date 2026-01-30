import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";

import Header from "@/components/layout/Header";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";

import kakaoIcon from "@/assets/icons/kakao.png";
import naverIcon from "@/assets/icons/naver.png";
import googleIcon from "@/assets/icons/google.png";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string>("");

  // 로그인 상태면 메인으로 리다이렉트
  useEffect(() => {
    if (isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  // 에러 메시지 표시
  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "login_failed") {
      setErrorMessage("카카오 로그인에 실패했습니다. 다시 시도해주세요.");
    } else if (error === "callback_error") {
      setErrorMessage("로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    } else {
      setErrorMessage("");
    }
  }, [searchParams]);

  const handleKakaoLogin = () => {
    window.location.href = "http://localhost:8000/api/auth/kakao/login";
  };

  const handleSocialLogin = (provider: "google" | "naver" | "kakao") => {
    if (provider === "kakao") return handleKakaoLogin();
    setErrorMessage("해당 소셜 로그인은 준비 중입니다. 현재는 카카오로 로그인해주세요.");
  };

  const socialButtons = useMemo(
    () => [
      {
        key: "kakao" as const,
        label: "카카오로 계속하기",
        icon: (
        <img
        src={kakaoIcon}
        alt="카카오"
        className="w-6 h-6 object-contain"
        />
        ),
        bg: "#FEE500",
        textClass: "text-black",
        enabled: true,
      },
      {
        key: "naver" as const,
        label: "네이버로 계속하기",
        icon: (
        <img
        src={naverIcon}
        alt="네이버"
        className="w-6 h-6 object-contain"
        />
        ),
        bg: "#03C75A",
        textClass: "text-white",
        enabled: true,
        // badge: "준비중",
      },
      {
        key: "google" as const,
        label: "Google로 계속하기",
        icon: (
        <img
        src={googleIcon}
        alt="구글"
        className="w-6 h-6 object-contain"
        />
        ),
        bg: "#4285F4",
        textClass: "text-white",
        enabled: true,
        // badge: "준비중",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <Navigation />

      {/* ✅ 본문: 가운데 정렬 + 카드형 제거 */}
      <main className="w-full min-h-[calc(100vh-260px)] flex flex-col justify-center">
        <div className="container mx-auto px-4 lg:px-8 py-10 lg:py-14">
          <div className="mx-auto w-full max-w-md lg:max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              소셜 계정으로 안전하게 로그인
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">+</span>
              </div>

              <div>
                <div className="text-lg font-bold text-foreground">간편 로그인</div>
                <div className="text-xs text-muted-foreground">소셜 계정으로 빠르게 시작해요</div>
              </div>
            </div>

            {errorMessage && (
              <Alert variant="destructive" className="mt-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <div className="mt-8 space-y-4">
              {socialButtons.map((b) => (
                <button
                  key={b.key}
                  onClick={() => b.enabled && handleSocialLogin(b.key)}
                  disabled={!b.enabled}
                  className={[
                    "w-full relative overflow-hidden rounded-2xl border",
                    "px-6 py-4",
                    "flex items-center justify-center gap-3",
                    "font-semibold",
                    "shadow-sm transition",
                    b.enabled
                      ? "hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      : "opacity-60 cursor-not-allowed",
                  ].join(" ")}
                  style={{ backgroundColor: b.bg, borderColor: "rgba(0,0,0,0.06)" }}
                >
                  <span className="absolute left-4 flex items-center">{b.icon}</span>
                  <span className={b.textClass}>{b.label}</span>

                  {/* {b.badge && (
                    <span
                      className={[
                        "absolute right-4 text-xs font-bold px-2 py-0.5 rounded-full",
                        "bg-black/15",
                        b.textClass,
                      ].join(" ")}
                    >
                      {b.badge}
                    </span>
                  )} */}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-secondary/60 border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="mt-0.5">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  소셜 계정 정보는 로그인 목적 외로 저장/사용하지 않아요.
                </div>
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              로그인 시 서비스 이용약관 및 개인정보 처리방침에 동의한 것으로 간주됩니다.
            </div>
          </div>
        </div>
      </main>

      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  );
};

export default Login;
