import React, { createContext, useContext, useEffect, useState } from "react";
import useStore from "./useStore";

type User = {
  id: number;
  login_id: string;
  type: string;
  email: string;
  role: string;
  social?: {
    provider: string;
    display_name: string;
    provider_user_id: string;
  };
};

type AuthContextType = {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
  login: (token: string, user?: User) => void;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("auth_token");
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 앱 초기화 시 서버에서 현재 로그인 상태 확인
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/auth/kakao/me", {
          method: "GET",
          credentials: "include", // 쿠키 포함
        });

        const data = await response.json();

        if (data.isLoggedIn && data.user) {
          setToken(data.user.id.toString());
          setUser(data.user);
          try {
            // zustand store에도 동기화
            useStore.getState().setUser({
              id: data.user.id.toString(),
              name: data.user.social?.display_name || data.user.login_id || undefined,
              email: data.user.email || undefined,
              provider: data.user.social?.provider || undefined,
            });
          } catch {}
          try {
            localStorage.setItem("auth_token", data.user.id.toString());
          } catch {
            // localStorage 저장 실패 무시
          }
        } else {
          setToken(null);
          setUser(null);
          try { useStore.getState().clearUser(); } catch {}
          try {
            localStorage.removeItem("auth_token");
          } catch {
            // localStorage 제거 실패 무시
          }
        }
      } catch (error) {
        console.error("인증 상태 확인 실패:", error);
        // 에러는 무시하고 로그아웃 상태로 유지
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const login = (t: string, userData?: User) => {
    setToken(t);
    if (userData) {
      setUser(userData);
      try {
        useStore.getState().setUser({
          id: userData.id.toString(),
          name: userData.social?.display_name || userData.login_id || undefined,
          email: userData.email || undefined,
          provider: userData.social?.provider || undefined,
        });
      } catch {}
    }
    try {
      localStorage.setItem("auth_token", t);
    } catch {
      // ignore storage errors
    }
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    try { useStore.getState().clearUser(); } catch {}
    try {
      localStorage.removeItem("auth_token");
    } catch {
      // ignore storage errors
    }

    // 백엔드 로그아웃 API 호출
    try {
      await fetch("http://localhost:8000/api/auth/kakao/logout", {
        method: "GET",
        credentials: "include",
      });
    } catch (error) {
      console.error("로그아웃 API 호출 실패:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, token, user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
