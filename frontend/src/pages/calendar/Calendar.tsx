import React, { useMemo, useState, useEffect } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Utensils } from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import apiClient from "@/api/axios";
import useStore from "@/lib/useStore";

type MealType = "breakfast" | "lunch" | "dinner";

type MealItem = {
    id: string;
    name: string;
    type: MealType;
    image?: string;
    recipeId?: number | null;
}

type DayMeals = {
    date: Date;
    meals: MealItem[];
}

// 초기값(백엔드 데이터가 없을 때 보여줄 기본값)
const sampleMeals: DayMeals[] = [];

const mealTypeLabels: Record<MealType, string> = {
    breakfast: "아침",
    lunch: "점심",
    dinner: "저녁",
};

const mealTypeOrder: Record<MealType, number> = {
    breakfast: 1,
    lunch: 2,
    dinner: 3,
};

const mealTypeBorderColors: Record<MealType, string> = {
    breakfast: "border-l-amber-400",
    lunch: "border-l-emerald-400",
    dinner: "border-l-violet-400",
};

const MealCalendarPage: React.FC = () => {
    const navigate = useNavigate();

    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [dayMealsData, setDayMealsData] = useState<DayMeals[]>(sampleMeals);

    const user = useStore((s: any) => s.user);

    useEffect(() => {
        let mounted = true;
        if (!user || !user.id) return;

        (async () => {
            try {
                const rows = await apiClient.get<any[]>("recommendations/calendar", { member_id: user.id });

                // group by date
                const map: Record<string, MealItem[]> = {};
                rows.forEach((r) => {
                    const dateKey = r.meal_date;
                    const korType = r.meal_type;
                    const type: MealItem["type"] = korType === "아침" ? "breakfast" : korType === "점심" ? "lunch" : "dinner";
                    const item: MealItem = {
                        id: String(r.recipe?.id ?? `${dateKey}-${type}`),
                        name: r.recipe?.name ?? "레시피 없음",
                        type,
                        image: r.recipe?.thumbnail ?? undefined,
                        recipeId: r.recipe?.id ?? null,
                    };

                    if (!map[dateKey]) map[dateKey] = [];
                    map[dateKey].push(item);
                });

                const arr: DayMeals[] = Object.keys(map).map((k) => ({ date: new Date(k), meals: map[k] }));
                if (mounted) setDayMealsData(arr);
            } catch (e) {
                // ignore fetch errors for now
                console.error("Failed to load meal calendar:", e);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [user]);

    const weekDays = useMemo(() => {
        const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
        const days: Date[] = [];
        for (let i = 0; i < 7; i++) {
            days.push(addDays(weekStart, i));
        }
        return days;
    }, [currentWeek]);

    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 0 });

    const getMealsForDate = (date: Date): MealItem[] => {
        const dayMeals = dayMealsData.find((dm) => isSameDay(dm.date, date));
        return dayMeals?.meals ?? [];
    };

    const selectedDayMeals = selectedDate ? getMealsForDate(selectedDate) : [];

    const dayLabels = ["일", "월", "화", "수", "목", "금", "토"];

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-border p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="mt-0.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2">
                            <CalendarDays className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-extrabold whitespace-nowrap">
                                    식단 캘린더
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* 주간 선택 (날짜 선택) */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                            className="h-10 w-10 rounded-xl border border-border bg-card hover:bg-secondary transition-colors flex items-center justify-center"
                        >
                            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                        </button>
                        <span className="min-w-[200px] text-center font-bold text-foreground">
                            {format(weekStart, "M월 d일", { locale: ko })} - {format(weekEnd, "M월 d일", { locale: ko })}
                        </span>
                        <button
                            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                            className="h-10 w-10 rounded-xl border border-border bg-card hover:bg-secondary transition-colors flex items-center justify-center"
                        >
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </button>
                    </div>
                </div>
            </div>

            {/* 선택 날짜의 정보 제공 영역 */}
            <div className="rounded-2xl bg-card border border-border p-5">
                <div className="mb-4">
                    <h3 className="text-lg font-bold text-foreground">
                        {selectedDate ? format(selectedDate, "M월 d일 (EEEE)", { locale: ko }) : "날짜를 선택하세요"}
                    </h3>
                </div>

                {/* 선택 날짜에 식단이 없는 경우 */}
                {selectedDayMeals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="rounded-full bg-secondary p-4 mb-3">
                            <Utensils className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                            등록된 식단이 없습니다
                        </p>
                        <button className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors" onClick={() => { navigate(`/#ai-recommendation`) }}>
                            식단 추천받기
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {(["breakfast", "lunch", "dinner"] as MealType[]).map((type) => {
                            const meal = selectedDayMeals.find((m) => m.type === type) ?? null;

                            return (
                                <div key={type} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg font-semibold text-foreground">
                                            {mealTypeLabels[type]}
                                        </span>
                                    </div>

                                    <div
                                        role={meal ? "button" : undefined}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (meal && meal.recipeId) navigate(`/recipes/${meal.recipeId}`);
                                        }}
                                        className={`rounded-xl border border-border bg-secondary/50 overflow-hidden hover:bg-secondary transition-colors border-l-4 ${mealTypeBorderColors[type]} ${meal ? 'cursor-pointer' : ''}`}>
                                        {meal && meal.image ? (
                                            <div className="aspect-video w-full overflow-hidden">
                                                <img src={meal.image} alt={meal.name} className="w-full h-full object-cover" />
                                            </div>
                                        ) : (
                                            <div className="aspect-video w-full flex items-center justify-center bg-slate-100 text-slate-400">
                                                <Utensils className="h-8 w-8" />
                                            </div>
                                        )}

                                        <div className="p-3">
                                            <div className="font-medium text-foreground">
                                                {meal ? meal.name : "등록된 식단이 없습니다"}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 주간 식단표 영역 */}
            <div className="rounded-2xl bg-card border border-border overflow-hidden">
                {/* ---------------- Mobile ---------------- */}
                <div className="md:hidden">
                    <div className="divide-y divide-border">
                        {weekDays.map((day, i) => {
                            const meals = getMealsForDate(day);
                            const isSelected = selectedDate && isSameDay(day, selectedDate);
                            const isTodayDate = isToday(day);

                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedDate(day)}
                                    className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-secondary/30"
                                        }`}
                                >
                                    {/* 날짜 헤더 */}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div
                                                className={`text-xs font-semibold ${i === 0
                                                    ? "text-red-500"
                                                    : i === 6
                                                        ? "text-blue-500"
                                                        : "text-muted-foreground"
                                                    }`}
                                            >
                                                {dayLabels[i]}
                                            </div>

                                            <div
                                                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shrink-0 ${isTodayDate
                                                    ? "bg-primary text-primary-foreground"
                                                    : i === 0
                                                        ? "text-red-500"
                                                        : i === 6
                                                            ? "text-blue-500"
                                                            : "text-foreground"
                                                    }`}
                                            >
                                                {format(day, "d")}
                                            </div>

                                            <div className="text-sm font-semibold text-foreground truncate">
                                                {format(day, "M월 d일 (EEE)", { locale: ko })}
                                            </div>
                                        </div>

                                        {isSelected && (
                                            <span className="text-xs font-semibold text-primary shrink-0">
                                                선택됨
                                            </span>
                                        )}
                                    </div>

                                    {/* 식단 프리뷰(크게) */}
                                    <div className="mt-3">
                                        {meals.length === 0 ? (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                                                <Utensils className="h-4 w-4 opacity-60" />
                                                <span>등록된 식단이 없습니다</span>
                                            </div>
                                        ) : (
                                            <div className="flex gap-3 overflow-x-auto pb-1">
                                                {(["breakfast", "lunch", "dinner"] as MealType[]).map((type) => {
                                                    const meal = meals.find((m) => m.type === type) ?? null;

                                                    return (
                                                        <div
                                                            key={type}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (meal?.recipeId) navigate(`/recipes/${meal.recipeId}`);
                                                            }}
                                                            className={`relative rounded-xl overflow-hidden border border-border bg-secondary/30 shrink-0 ${meal?.recipeId ? "cursor-pointer" : "cursor-default opacity-80"
                                                                }`}
                                                            style={{ width: 124 }}
                                                        >
                                                            {/* 썸네일 */}
                                                            <div className="h-[78px] w-full bg-secondary overflow-hidden">
                                                                {meal?.image ? (
                                                                    <img
                                                                        src={meal.image}
                                                                        alt={meal.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                        <Utensils className="h-5 w-5 text-muted-foreground" />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* 타입 라벨 */}
                                                            <div
                                                                className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-bold bg-black/45 text-white`}
                                                            >
                                                                {mealTypeLabels[type]}
                                                            </div>

                                                            {/* 제목 */}
                                                            <div className={`p-2 border-l-4 ${mealTypeBorderColors[type]}`}>
                                                                <div className="text-xs font-semibold text-foreground line-clamp-2">
                                                                    {meal ? meal.name : "미등록"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ---------------- Desktop ---------------- */}
                <div className="hidden md:block">
                    <div className="grid grid-cols-7 border-b border-border">
                        {weekDays.map((day, i) => {
                            const isSelected = selectedDate && isSameDay(day, selectedDate);
                            const isTodayDate = isToday(day);

                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedDate(day)}
                                    className={`py-4 text-center transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-secondary/50"}`}
                                >
                                    <div
                                        className={`text-xs font-medium mb-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                                            }`}
                                    >
                                        {dayLabels[i]}
                                    </div>
                                    <div
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${isTodayDate ? "bg-primary text-primary-foreground" : ""
                                            } ${!isTodayDate && i === 0
                                                ? "text-red-500"
                                                : !isTodayDate && i === 6
                                                    ? "text-blue-500"
                                                    : !isTodayDate
                                                        ? "text-foreground"
                                                        : ""
                                            }`}
                                    >
                                        {format(day, "d")}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-7 min-h-[280px]">

                        {weekDays.map((day, i) => {
                            const meals = [...getMealsForDate(day)].sort(
                                (a, b) => mealTypeOrder[a.type] - mealTypeOrder[b.type]
                            );
                            const isSelected = selectedDate && isSameDay(day, selectedDate);

                            return (
                                <div
                                    key={i}
                                    onClick={() => setSelectedDate(day)}
                                    className={`
                                        p-2 border-r border-border cursor-pointer transition-colors
                                        ${i === 6 ? "border-r-0" : ""}
                                        ${isSelected ? "bg-primary/5" : "hover:bg-secondary/30"}`}
                                >
                                    {meals.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                            <Utensils className="h-4 w-4 opacity-30" />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {meals.slice(0, 3).map((meal) => (
                                                <div
                                                    key={meal.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (meal.recipeId) navigate(`/recipes/${meal.recipeId}`);
                                                    }}
                                                    className={`group relative overflow-hidden rounded-lg border-l-4 ${mealTypeBorderColors[meal.type]} ${meal.recipeId ? "cursor-pointer" : ""
                                                        }`}
                                                >
                                                    <div className="aspect-square bg-secondary overflow-hidden">
                                                        {meal.image ? (
                                                            <img
                                                                src={meal.image}
                                                                alt={meal.name}
                                                                className="w-full h-full object-cover transition-transform"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Utensils className="h-4 w-4 text-muted-foreground" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MealCalendarPage;