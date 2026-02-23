import React, { useEffect, useRef, useState } from "react";
import { User, Phone, Mail, Heart, ThumbsDown, X, Plus } from "lucide-react";

import apiClient from "@/api/axios";
import useStore from "@/lib/useStore";

interface ProfileData {
    phone: string;
    email: string;
    likes: string[];
    dislikes: string[];
}

const ProfileEdit: React.FC = () => {
    const [profile, setProfile] = useState<ProfileData>({
        phone: "",
        email: "",
        likes: [],
        dislikes: [],
    });

    const user = useStore((s: any) => s.user);

    useEffect(() => {
        if (!user) return;

        (async () => {
            const rows = await apiClient.get<ProfileData>(
                "/mypage/edit",
                { member_id: user.id, }
            );
            setProfile(rows);
        })();
    }, [user]);

    const [isEditing, setIsEditing] = useState<Record<string, boolean>>({});
    const [likesInput, setLikesInput] = useState("");
    const [dislikeInput, setDislikeInput] = useState("");
    const [saveToast, setSaveToast] = useState<string | null>(null);
    const saveToastTimerRef = useRef<number | null>(null);

    const showSaveToast = (msg: string) => {
    setSaveToast(msg);
    if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
    saveToastTimerRef.current = window.setTimeout(() => {
        setSaveToast(null);
        saveToastTimerRef.current = null;
    }, 2000);
    };

    useEffect(() => {
    return () => {
        if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
    };
    }, []);

    const toggleEdit = (field: string) => {
        setIsEditing((prev) => ({ ...prev, [field]: !prev[field] }));
    };

    const handleChange = (field: keyof ProfileData, value: string) => {
        setProfile((prev) => ({ ...prev, [field]: value }));
    };

    const addTaste = (field: "likes" | "dislikes") => {
        const input = field === "likes" ? likesInput : dislikeInput;
        const trimmed = input.trim();
        if (!trimmed) return;

        setProfile((prev) => {
            if (prev[field].includes(trimmed)) return prev;
            return { ...prev, [field]: [...prev[field], trimmed] };
        });

        if (field === "likes") {
            setLikesInput("");
        } else {
            setDislikeInput("");
        }
    };

    const removeTaste = (field: "likes" | "dislikes", taste: string) => {
        setProfile((prev) => ({
            ...prev,
            [field]: prev[field].filter((t) => t !== taste),
        }));
    };

    const handleSave = async () => {
        try {
            const res = await apiClient.post<{ success: boolean; message: string }>(
            "mypage/edit",
            {
                member_id: user.id,
                ...profile,
            }
            );

            if (res.success) {
            showSaveToast(res.message || "변경사항이 저장되었어요");
            } else {
            showSaveToast(res.message || "저장에 실패했어요");
            }
        } catch (e: any) {
            console.error(e);
            showSaveToast("저장에 실패했어요");
        }
        };


    return (
        <div className="space-y-4">
            <div className="mx-auto max-w-5xl space-y-4">
                {/* Header */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2">
                            <User className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                        </div>
                        <div>
                            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
                                내 정보 수정
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                개인정보를 안전하게 관리하세요
                            </p>
                        </div>
                    </div>
                </div>

                {/* Profile Form */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                    {/* 전화번호 */}
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="shrink-0 rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2">
                                    <Phone className="h-4 w-4 text-orange-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label className="text-sm font-semibold text-slate-900 dark:text-white">
                                        전화번호
                                    </label>
                                    {isEditing.phone ? (
                                        <input
                                            type="tel"
                                            value={profile.phone}
                                            onChange={(e) => handleChange("phone", e.target.value)}
                                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-orange-300 dark:focus:border-orange-700"
                                            placeholder="010-0000-0000"
                                        />
                                    ) : (
                                        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 truncate">
                                            {profile.phone}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => toggleEdit("phone")}
                                className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors"
                            >
                                {isEditing.phone ? "완료" : "수정"}
                            </button>
                        </div>
                    </div>

                    {/* 이메일 */}
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="shrink-0 rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2">
                                    <Mail className="h-4 w-4 text-orange-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <label className="text-sm font-semibold text-slate-900 dark:text-white">
                                        이메일
                                    </label>
                                    {isEditing.email ? (
                                        <input
                                            type="email"
                                            value={profile.email}
                                            onChange={(e) => handleChange("email", e.target.value)}
                                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm outline-none focus:border-orange-300 dark:focus:border-orange-700"
                                            placeholder="example@email.com"
                                        />
                                    ) : (
                                        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 truncate">
                                            {profile.email}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => toggleEdit("email")}
                                className="shrink-0 text-sm font-semibold text-orange-500 hover:text-orange-600 transition-colors"
                            >
                                {isEditing.email ? "완료" : "수정"}
                            </button>
                        </div>
                    </div>

                    {/* 선호 취향 */}
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2 mt-0.5">
                                <Heart className="h-4 w-4 text-orange-500" />
                            </div>
                            <div className="flex-1">
                                <label className="text-sm font-semibold text-slate-900 dark:text-white">
                                    선호 취향
                                </label>

                                {/* 입력 필드 */}
                                <div className="flex gap-2 mt-3">
                                    <input
                                        value={likesInput}
                                        onChange={(e) => setLikesInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && addTaste("likes")}
                                        placeholder="예: 매운맛, 고소한맛, 토마토"
                                        className="flex-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-sm outline-none focus:border-orange-300 dark:focus:border-orange-700"
                                    />
                                    <button
                                        onClick={() => addTaste("likes")}
                                        className="
                                            shrink-0
                                            h-10 w-10 sm:h-auto sm:w-auto
                                            rounded-full
                                            bg-orange-500 text-white
                                            flex items-center justify-center
                                            hover:bg-orange-600 transition-colors
                                            sm:px-4 sm:py-2
                                            whitespace-nowrap
                                        "
                                        aria-label="선호 취향 추가"
                                    >
                                        {/* 모바일: 아이콘만 */}
                                        <Plus className="h-4 w-4 sm:hidden" />
                                        {/* 웹: 기존처럼 텍스트 */}
                                        <span className="hidden sm:inline text-sm font-medium">추가</span>
                                    </button>
                                </div>

                                {/* 태그 목록 */}
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {profile.likes.length > 0 ? (
                                        profile.likes.map((taste) => (
                                            <span
                                                key={taste}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400"
                                            >
                                                {taste}
                                                <button
                                                    onClick={() => removeTaste("likes", taste)}
                                                    className="hover:bg-orange-200 dark:hover:bg-orange-900 rounded-full p-0.5 transition-colors"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm text-slate-400">추가된 취향이 없습니다</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 비선호 취향 */}
                    <div className="p-5">
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 p-2 mt-0.5">
                                <ThumbsDown className="h-4 w-4 text-slate-500" />
                            </div>
                            <div className="flex-1">
                                <label className="text-sm font-semibold text-slate-900 dark:text-white">
                                    비선호 취향
                                </label>

                                {/* 입력 필드 */}
                                <div className="flex gap-2 mt-3">
                                    <input
                                        value={dislikeInput}
                                        onChange={(e) => setDislikeInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && addTaste("dislikes")}
                                        placeholder="예: 느끼한맛, 씁쓸한맛"
                                        className="flex-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-sm outline-none focus:border-slate-300 dark:focus:border-slate-600"
                                    />
                                    <button
                                        onClick={() => addTaste("dislikes")}
                                        className="
                                            shrink-0
                                            h-10 w-10 sm:h-auto sm:w-auto
                                            rounded-full
                                            bg-slate-600 text-white
                                            flex items-center justify-center
                                            hover:bg-slate-700 transition-colors
                                            sm:px-4 sm:py-2
                                            whitespace-nowrap
                                        "
                                        aria-label="비선호 취향 추가"
                                    >
                                        <Plus className="h-4 w-4 sm:hidden" />
                                        <span className="hidden sm:inline text-sm font-medium">추가</span>
                                    </button>
                                </div>

                                {/* 태그 목록 */}
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {profile.dislikes.length > 0 ? (
                                        profile.dislikes.map((taste) => (
                                            <span
                                                key={taste}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                                            >
                                                {taste}
                                                <button
                                                    onClick={() => removeTaste("dislikes", taste)}
                                                    className="hover:bg-slate-300 dark:hover:bg-slate-600 rounded-full p-0.5 transition-colors"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm text-slate-400">추가된 취향이 없습니다</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    className="w-full rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 flex items-center justify-center gap-2 transition-colors shadow-lg shadow-orange-500/20"
                >
                    변경사항 저장
                </button>
                {saveToast && (
                    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
                        <div className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-slate-900">
                            {saveToast}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileEdit;
