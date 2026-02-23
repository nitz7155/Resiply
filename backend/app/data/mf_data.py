"""MF 학습용 데이터 생성(members.csv/ratings.csv)."""
import csv
import json
import os
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from database import SessionLocal
from models import Product, Category, MajorCategory

# -----------------------------------------------------------------------------
# recommend.py (data generator)
# - Builds items from classified_food.json (real major/sub categories + item names)
# - Generates MF/CF-friendly implicit "exposure" + explicit 1~5 ratings
# -----------------------------------------------------------------------------

# ---------------------------
# Config (override via ENV)
# ---------------------------
SEED = int(os.getenv("REC_SEED", "42"))
NUM_MEMBERS = int(os.getenv("REC_NUM_MEMBERS", "100"))

# Ratings per member:
RATINGS_MIN = int(os.getenv("REC_RATINGS_MIN", "50"))
RATINGS_MAX = int(os.getenv("REC_RATINGS_MAX", "70"))

# Bridge items count range (global overlap to keep graph connected)
BRIDGE_MIN = int(os.getenv("REC_BRIDGE_MIN", "8"))
BRIDGE_MAX = int(os.getenv("REC_BRIDGE_MAX", "70"))

# Percent of members who have a constraint/avoidance
CONSTRAINT_MEMBER_PROB = float(os.getenv("REC_CONSTRAINT_MEMBER_PROB", "0.30"))

# If you want to cap the item pool (optional). Leave empty to use all.
ITEM_CAP = os.getenv("REC_ITEM_CAP", "").strip()
ITEM_CAP = int(ITEM_CAP) if ITEM_CAP else None

# Output directory (defaults to app/data)
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DATA_DIR = Path(os.getenv("REC_DATA_DIR", str(DEFAULT_DATA_DIR)))

# Path to your taxonomy file
CLASSIFIED_FOOD_PATH = Path(
    os.getenv(
        "REC_CLASSIFIED_FOOD_JSON",
        str(Path(__file__).resolve().parents[1] / "data" / "classified_food.json"),
    )
).resolve()

# ---------------------------
# Domain: major categories
# ---------------------------
# Domain: major categories (loaded from classified_food.json)
# ---------------------------
# These are initialized at runtime based on the taxonomy file.
CATEGORIES: List[str] = []
NEIGHBORS: Dict[str, List[str]] = {}
CONSTRAINT_CANDIDATES: List[str] = []
PROFILES: List[dict] = []
NEUTRAL_MAJOR_CATEGORIES: List[str] = []
NEUTRAL_SUBCATEGORIES: List[str] = []
SUBCATEGORIES_BY_MAJOR: Dict[str, List[str]] = {}


def init_categories_from_taxonomy(path: Path):
    """분류 JSON에서 대분류/소분류 초기화."""
    global CATEGORIES, NEIGHBORS, CONSTRAINT_CANDIDATES, PROFILES, SUBCATEGORIES_BY_MAJOR
    global NEUTRAL_MAJOR_CATEGORIES, NEUTRAL_SUBCATEGORIES

    obj = json.loads(path.read_text(encoding="utf-8"))
    categories = list(obj.keys())
    if not categories:
        raise RuntimeError("No categories found in classified_food.json")

    CATEGORIES = categories
    SUBCATEGORIES_BY_MAJOR = {k: list(v.keys()) for k, v in obj.items() if isinstance(v, dict)}
    NEUTRAL_MAJOR_CATEGORIES = [c for c in ["양념/소스/조미료"] if c in CATEGORIES]
    NEUTRAL_SUBCATEGORIES = [
        "생수/탄산수",
        "장류",
        "식용유/기름",
        "소스",
        "식초/소금/설탕/향신료",
        "당류/액",
        "액젓",
        "드레싱",
        "깨",
    ]

    # Build a simple ring neighbor map for overlap.
    NEIGHBORS = {}
    for idx, cat in enumerate(CATEGORIES):
        left = CATEGORIES[(idx - 1) % len(CATEGORIES)]
        right = CATEGORIES[(idx + 1) % len(CATEGORIES)]
        NEIGHBORS[cat] = [left, right]

    # Prefer common constraint groups if they exist, else pick first 3.
    preferred = ["육류/해산물/계란", "가공/편의식/스낵", "쌀/면/떡"]
    CONSTRAINT_CANDIDATES = [c for c in preferred if c in CATEGORIES and c not in NEUTRAL_MAJOR_CATEGORIES]
    if len(CONSTRAINT_CANDIDATES) < 3:
        for c in CATEGORIES:
            if c not in CONSTRAINT_CANDIDATES and c not in NEUTRAL_MAJOR_CATEGORIES:
                CONSTRAINT_CANDIDATES.append(c)
            if len(CONSTRAINT_CANDIDATES) >= 3:
                break

    # Basic profiles, skipping any missing categories.
    all_subs = set()
    for subs in SUBCATEGORIES_BY_MAJOR.values():
        all_subs.update(subs)

    def _pick(name: str, fav_majors: List[str], avoid_majors: List[str], fav_subs: List[str], avoid_subs: List[str]):
        fav_m = []
        av_m = []
        fav_s = [s for s in fav_subs if s in all_subs and s not in NEUTRAL_SUBCATEGORIES]
        av_s = [s for s in avoid_subs if s in all_subs and s not in NEUTRAL_SUBCATEGORIES]
        return {
            "name": name,
            "favorite_majors": fav_m,
            "avoid_majors": av_m,
            "favorite_subs": fav_s,
            "avoid_subs": av_s,
        }

    PROFILES = [
        _pick(
            "육류 선호",
            ["육류/해산물/계란"],
            [],
            ["소고기", "돼지고기", "닭/오리/기타"],
            [],
        ),
        _pick(
            "면 선호",
            ["쌀/면/떡"],
            [],
            ["면류"],
            [],
        ),
        _pick(
            "채소 선호",
            ["채소/과일"],
            [],
            ["잎채소", "버섯류", "근채류", "과채류", "채소/기타"],
            [],
        ),
        _pick(
            "해산물 비선호",
            [],
            [],
            [],
            ["해산물"],
        ),
        _pick(
            "과자 선호(스낵 선호)",
            ["가공/편의식/스낵"],
            [],
            ["빵/케이크/도너츠", "시리얼/프로틴바", "기타가공식", "만두/떡볶이/순대"],
            [],
        ),
        _pick(
            "유당 불내증",
            ["음료/유제품"],
            ["음료/유제품"],
            ["두유"],
            ["우유", "치즈", "요거트"],
        ),
        _pick(
            "다이어트중",
            ["채소/과일"],
            ["가공/편의식/스낵", "쌀/면/떡"],
            ["잎채소", "버섯류", "과채류", "두부/유부", "계란"],
            ["빵/케이크/도너츠", "만두/떡볶이/순대", "햄/소시지/베이컨", "즉석식품", "기타가공식"],
        ),
        _pick(
            "채식주의자",
            ["채소/과일"],
            ["육류/해산물/계란"],
            ["두부/유부", "곡류/두류", "잎채소", "버섯류", "근채류", "과채류", "채소/기타", "과일", "냉동과일"],
            ["소고기", "돼지고기", "닭/오리/기타", "해산물"],
        ),
    ]


def init_categories_from_db():
    """DB 기준으로 대분류/소분류 초기화."""
    global CATEGORIES, NEIGHBORS, CONSTRAINT_CANDIDATES, PROFILES, SUBCATEGORIES_BY_MAJOR
    global NEUTRAL_MAJOR_CATEGORIES, NEUTRAL_SUBCATEGORIES

    with SessionLocal() as db:
        majors = db.query(MajorCategory.name).all()
        category_rows = (
            db.query(MajorCategory.name, Category.name)
            .join(Category, Category.major_category_id == MajorCategory.id)
            .all()
        )
    categories = [m[0] for m in majors if m and m[0]]
    if not categories:
        raise RuntimeError("No categories found in DB major_category table")

    CATEGORIES = categories
    SUBCATEGORIES_BY_MAJOR = {}
    for major_name, cat_name in category_rows:
        if not major_name or not cat_name:
            continue
        SUBCATEGORIES_BY_MAJOR.setdefault(major_name, []).append(cat_name)
    NEUTRAL_MAJOR_CATEGORIES = [c for c in ["양념/소스/조미료"] if c in CATEGORIES]
    NEUTRAL_SUBCATEGORIES = [
        "생수/탄산수",
        "장류",
        "식용유/기름",
        "소스",
        "식초/소금/설탕/향신료",
        "당류/액",
        "액젓",
        "드레싱",
        "깨",
    ]

    NEIGHBORS = {}
    for idx, cat in enumerate(CATEGORIES):
        left = CATEGORIES[(idx - 1) % len(CATEGORIES)]
        right = CATEGORIES[(idx + 1) % len(CATEGORIES)]
        NEIGHBORS[cat] = [left, right]

    preferred = ["??/???/??", "??/???/??", "?/?/?"]
    CONSTRAINT_CANDIDATES = [c for c in preferred if c in CATEGORIES and c not in NEUTRAL_MAJOR_CATEGORIES]
    if len(CONSTRAINT_CANDIDATES) < 3:
        for c in CATEGORIES:
            if c not in CONSTRAINT_CANDIDATES and c not in NEUTRAL_MAJOR_CATEGORIES:
                CONSTRAINT_CANDIDATES.append(c)
            if len(CONSTRAINT_CANDIDATES) >= 3:
                break

    all_subs = set()
    for subs in SUBCATEGORIES_BY_MAJOR.values():
        all_subs.update(subs)

    def _pick(name: str, fav_majors: list, avoid_majors: list, fav_subs: list, avoid_subs: list):
        fav_m = [c for c in fav_majors if c in CATEGORIES and c not in NEUTRAL_MAJOR_CATEGORIES]
        av_m = [c for c in avoid_majors if c in CATEGORIES and c not in NEUTRAL_MAJOR_CATEGORIES]
        fav_s = [s for s in fav_subs if s in all_subs and s not in NEUTRAL_SUBCATEGORIES]
        av_s = [s for s in avoid_subs if s in all_subs and s not in NEUTRAL_SUBCATEGORIES]
        return {
            "name": name,
            "favorite_majors": fav_m,
            "avoid_majors": av_m,
            "favorite_subs": fav_s,
            "avoid_subs": av_s,
        }

    PROFILES = [
        _pick(
            "육류 선호",
            ["육류/해산물/계란"],
            [],
            ["소고기", "돼지고기", "닭/오리/기타"],
            [],
        ),
        _pick(
            "면 선호",
            ["쌀/면/떡"],
            [],
            ["면류"],
            [],
        ),
        _pick(
            "채소 선호",
            ["채소/과일"],
            [],
            ["잎채소", "버섯류", "근채류", "과채류", "채소/기타"],
            [],
        ),
        _pick(
            "해산물 비선호",
            [],
            [],
            [],
            ["해산물"],
        ),
        _pick(
            "과자 선호(스낵 선호)",
            ["가공/편의식/스낵"],
            [],
            ["빵/케이크/도너츠", "시리얼/프로틴바", "기타가공식", "만두/떡볶이/순대"],
            [],
        ),
        _pick(
            "유당 불내증",
            ["음료/유제품"],
            ["음료/유제품"],
            ["두유"],
            ["우유", "치즈", "요거트"],
        ),
        _pick(
            "다이어트중",
            ["채소/과일"],
            ["가공/편의식/스낵", "쌀/면/떡"],
            ["잎채소", "버섯류", "과채류", "두부/유부", "계란"],
            ["빵/케이크/도너츠", "만두/떡볶이/순대", "햄/소시지/베이컨", "즉석식품", "기타가공식"],
        ),
        _pick(
            "채식주의자",
            ["채소/과일"],
            ["육류/해산물/계란"],
            ["두부/유부", "곡류/두류", "잎채소", "버섯류", "근채류", "과채류", "채소/기타", "과일", "냉동과일"],
            ["소고기", "돼지고기", "닭/오리/기타", "해산물"],
        ),
    ]



@dataclass(frozen=True)
class Item:
    item_id: str
    major: str
    sub: str
    name: str
    is_bridge: bool


def clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


def round_to_int_rating(x: float) -> int:
    return int(clamp(round(x), 1, 5))


def pick_neighbor_category(cat: str) -> str:
    opts = NEIGHBORS.get(cat)
    if not opts:
        # fallback: circular neighbor in CATEGORIES order
        idx = CATEGORIES.index(cat)
        return random.choice([CATEGORIES[(idx - 1) % len(CATEGORIES)], CATEGORIES[(idx + 1) % len(CATEGORIES)]])
    return random.choice(opts)


def load_items_from_taxonomy(path: Path) -> List[Tuple[str, str, str, str]]:
    """Return list of tuples: (item_id, major, sub, name)."""
    if not CATEGORIES:
        init_categories_from_taxonomy(path)
    obj = json.loads(path.read_text(encoding="utf-8"))
    rows: List[Tuple[str, str, str, str]] = []
    for major, subcats in obj.items():
        if major not in CATEGORIES:
            # ignore unexpected keys gracefully
            continue
        for sub, idmap in subcats.items():
            for item_id, name in idmap.items():
                rows.append((str(item_id), major, str(sub), str(name)))
    return rows


def load_items_from_db() -> List[Tuple[str, str, str, str]]:
    """Return list of tuples: (item_id, major, sub, name) from DB products."""
    with SessionLocal() as db:
        rows = (
            db.query(Product.id, MajorCategory.name, Category.name, Product.title)
            .join(Category, Product.category_id == Category.id)
            .join(MajorCategory, Category.major_category_id == MajorCategory.id)
            .filter(Product.is_active == True)
            .all()
        )
    return [(str(pid), str(major), str(sub), str(title)) for pid, major, sub, title in rows]


def choose_bridge_items(raw_items: List[Tuple[str, str, str, str]], k_min: int, k_max: int) -> set:
    """
    Pick bridge items using a simple keyword heuristic + backfill.
    Bridge items are meant to be widely-rated across personas.
    """
    staple_keywords = [
        "백미", "현미", "쌀",
        "계란",
        "양파", "마늘", "대파",
        "두부", "곤약",
        "김치",
        "우유", "요거트",
        "라면", "즉석밥", "볶음밥",
        "김",  # 도시락김/조미김 등
    ]

    # 1) keyword hits
    hits: List[Tuple[str, str]] = []
    for item_id, major, sub, name in raw_items:
        if sub in NEUTRAL_SUBCATEGORIES:
            continue
        if any(k in name for k in staple_keywords):
            hits.append((item_id, major))

    # Prefer diversity across majors: interleave by major
    by_major: Dict[str, List[str]] = {m: [] for m in CATEGORIES}
    for item_id, major in hits:
        by_major[major].append(item_id)

    bridge: List[str] = []
    # round-robin
    while True:
        added_any = False
        for m in CATEGORIES:
            if by_major[m]:
                bridge.append(by_major[m].pop(0))
                added_any = True
        if not added_any:
            break
        if len(bridge) >= k_max:
            break

    # 2) backfill if too small: take early items per major
    if len(bridge) < k_min:
        seen = set(bridge)
        for m in CATEGORIES:
            for item_id, major, sub, name in raw_items:
                if major != m:
                    continue
                if item_id in seen:
                    continue
                bridge.append(item_id)
                seen.add(item_id)
                if len(bridge) >= k_min:
                    break
            if len(bridge) >= k_min:
                break

    # cap to k_max
    if len(bridge) > k_max:
        bridge = bridge[:k_max]

    return set(bridge)


def make_items(classified_food_path: Path) -> Tuple[List[Item], Dict[str, float], Dict[str, float]]:
    """
    Creates:
      - items: list[Item] with is_bridge flag
      - item_bias: per-item base preference (quality/average rating)
      - item_pop: per-item popularity weight (used for exposure)
    """
    raw = load_items_from_db()

    if ITEM_CAP is not None and ITEM_CAP > 0 and ITEM_CAP < len(raw):
        raw = raw[:ITEM_CAP]

    bridge_ids = choose_bridge_items(raw, BRIDGE_MIN, BRIDGE_MAX)

    items: List[Item] = []
    item_bias: Dict[str, float] = {}
    item_pop: Dict[str, float] = {}

    # Popularity: Zipf-ish by sorted id rank, bridge gets a boost.
    raw_sorted = sorted(raw, key=lambda x: x[0])
    for rank, (item_id, major, sub, name) in enumerate(raw_sorted, start=1):
        is_bridge = item_id in bridge_ids
        items.append(Item(item_id=item_id, major=major, sub=sub, name=name, is_bridge=is_bridge))

        item_bias[item_id] = random.uniform(-0.25, 0.25) if not is_bridge else random.uniform(-0.15, 0.15)

        zipf = 1.0 / (rank ** 0.85)
        item_pop[item_id] = zipf * (1.3 if is_bridge else 1.0)

    return items, item_bias, item_pop


def make_members() -> Tuple[List[str], Dict[str, str], Dict[str, float], Dict[str, Optional[str]], Dict[str, int], Dict[str, dict]]:
    """
    Returns:
      members: list of member_id
      member_persona: primary major category
      member_bias: member leniency/harshness
      member_constraint: avoided major category (or None)
      member_activity: number of ratings to generate
    """
    members: List[str] = []
    member_persona: Dict[str, str] = {}
    member_bias: Dict[str, float] = {}
    member_constraint: Dict[str, Optional[str]] = {}
    member_activity: Dict[str, int] = {}
    member_profile: Dict[str, dict] = {}

    sub_to_major = {}
    for major, subs in SUBCATEGORIES_BY_MAJOR.items():
        for sub in subs:
            sub_to_major[sub] = major

    # Distribute profiles roughly evenly across members
    base = NUM_MEMBERS // len(PROFILES)
    rem = NUM_MEMBERS % len(PROFILES)
    profile_pool = []
    for p in PROFILES:
        profile_pool.extend([p] * base)
    if rem:
        extra = PROFILES[:]
        random.shuffle(extra)
        profile_pool.extend(extra[:rem])
    random.shuffle(profile_pool)

    for u in range(NUM_MEMBERS):
        member_id = f"U{u+1:03d}"
        members.append(member_id)

        profile = profile_pool[u % len(profile_pool)]
        fav_subs = profile.get("favorite_subs", [])
        avoid_subs = profile.get("avoid_subs", [])

        favorite_majors = {sub_to_major.get(s) for s in fav_subs if sub_to_major.get(s)}
        avoid_majors = {sub_to_major.get(s) for s in avoid_subs if sub_to_major.get(s)}
        if favorite_majors & avoid_majors:
            # Avoid has priority if favorite/avoid map to same major.
            favorite_majors -= avoid_majors

        if favorite_majors:
            persona = random.choice(list(favorite_majors))
        else:
            candidates = [c for c in CATEGORIES if c not in avoid_majors]
            persona = random.choice(candidates) if candidates else CATEGORIES[u % len(CATEGORIES)]
        member_persona[member_id] = persona
        member_profile[member_id] = profile

        member_bias[member_id] = random.uniform(-0.45, 0.45)

        # Activity long-tail (80% normal, 20% heavy)
        if random.random() < 0.20:
            member_activity[member_id] = random.randint(max(RATINGS_MAX, 120), 200)
        else:
            member_activity[member_id] = random.randint(RATINGS_MIN, RATINGS_MAX)

        if avoid_majors:
            member_constraint[member_id] = random.choice(list(avoid_majors))
        elif random.random() < CONSTRAINT_MEMBER_PROB:
            member_constraint[member_id] = random.choice(CONSTRAINT_CANDIDATES)
        else:
            member_constraint[member_id] = None

    return members, member_persona, member_bias, member_constraint, member_activity, member_profile


def build_indices(items: List[Item]) -> Tuple[Dict[str, List[str]], Dict[str, Item]]:
    items_by_major: Dict[str, List[str]] = {m: [] for m in CATEGORIES}
    id_to_item: Dict[str, Item] = {}
    for it in items:
        id_to_item[it.item_id] = it
        items_by_major[it.major].append(it.item_id)
    return items_by_major, id_to_item


def sample_items_without_replacement(candidates: List[str], weights: List[float], k: int) -> List[str]:
    """
    Weighted sampling without replacement using Efraimidis-Spirakis keys.
    """
    if k <= 0 or not candidates:
        return []
    k = min(k, len(candidates))
    keys = []
    for x, w in zip(candidates, weights):
        w = max(w, 1e-9)
        r = random.random()
        keys.append((r ** (1.0 / w), x))
    keys.sort(reverse=True)
    return [x for _, x in keys[:k]]


def generate_ratings(
    items: List[Item],
    item_bias: Dict[str, float],
    item_pop: Dict[str, float],
    members: List[str],
    member_persona: Dict[str, str],
    member_bias: Dict[str, float],
    member_constraint: Dict[str, Optional[str]],
    member_activity: Dict[str, int],
    member_profile: Dict[str, dict],
    member_neighbor: Dict[str, str],
) -> List[List[str]]:
    items_by_major, id_to_item = build_indices(items)
    items_by_sub: Dict[str, List[str]] = {}
    for it in items:
        items_by_sub.setdefault(it.sub, []).append(it.item_id)
    all_item_ids = [it.item_id for it in items]

    # 비율 기반 그룹 구성 + 그룹별 평점 범위
    R_MAIN = 0.40
    R_POP = 0.20
    R_WEAK = 0.20
    R_AVOID = 0.05
    # remainder becomes noise
    AVOID_MISSING_PROB = float(os.getenv("REC_AVOID_MISSING_PROB", "0.0"))
    AVOID_MISSING_PROB = max(0.0, min(0.1, AVOID_MISSING_PROB))

    # Global popular pool: top 10~15% by item_pop (min 50), down-weight neutral majors
    popular_pool_size = max(50, int(len(all_item_ids) * 0.12))
    popular_ids = []
    for item_id, _ in sorted(item_pop.items(), key=lambda kv: kv[1], reverse=True):
        it = id_to_item.get(item_id)
        if it and it.major in NEUTRAL_MAJOR_CATEGORIES:
            continue
        popular_ids.append(item_id)
        if len(popular_ids) >= popular_pool_size:
            break
    popular_ids = set(popular_ids)

    def _pick_from_pool(pool: List[str], k: int, already: set) -> List[str]:
        if k <= 0:
            return []
        cand = [x for x in pool if x not in already]
        if not cand:
            return []
        k = min(k, len(cand))
        return random.sample(cand, k)

    def _score_by_group(group: str, ub: float, ib: float) -> int:
        # Group-based base ranges (keeps distribution stable / reduces 5.0 saturation)
        if group == "main":
            base = random.uniform(3.8, 5.0)
        elif group == "popular":
            base = random.uniform(2.8, 4.4)
        elif group == "weak":
            base = random.uniform(2.6, 4.2)
        elif group == "avoid":
            base = random.uniform(1.0, 2.2)
        elif group == "noise":
            base = random.uniform(1.0, 5.0)
        else:
            base = random.uniform(3.0, 4.0)

        # Keep ub/ib influence weak to avoid pushing everything to 5
        base += 0.25 * ub + 0.20 * ib

        # small noise
        if random.random() < 0.08:
            base += random.uniform(-0.4, 0.4)

        return round_to_int_rating(base)

    rows: List[List[str]] = []

    for member_id in members:
        persona = member_persona[member_id]
        neighbor = member_neighbor[member_id]
        constraint = member_constraint[member_id]
        profile = member_profile.get(
            member_id,
            {"favorite_subs": [], "avoid_subs": [], "favorite_majors": [], "avoid_majors": []},
        )
        ub = member_bias[member_id]
        target_n = member_activity[member_id]

        # 그룹별 수량 배분
        k_main = int(round(target_n * R_MAIN))
        k_pop = int(round(target_n * R_POP))
        k_weak = int(round(target_n * R_WEAK))
        k_avoid = int(round(target_n * R_AVOID))
        k_noise = max(0, target_n - (k_main + k_pop + k_weak + k_avoid))

        chosen: set = set()
        picked_groups: Dict[str, str] = {}  # item_id -> group

        # 메인 취향(페르소나/선호 소분류)
        main_pool = set(items_by_major.get(persona, []))
        for fav_sub in profile.get("favorite_subs", []):
            main_pool |= set(items_by_sub.get(fav_sub, []))
        main_pool = list(main_pool)

        for item_id in _pick_from_pool(main_pool, k_main, chosen):
            chosen.add(item_id)
            picked_groups[item_id] = "main"

        # 약한 관심 풀(메인/이웃/회피 제외)
        avoid_majors = set()
        avoid_subs = set(profile.get("avoid_subs", []))
        if constraint is not None:
            avoid_majors.add(constraint)

        excluded_majors = set([persona, neighbor]) | avoid_majors

        # 글로벌 인기 풀(회피 제외)
        pop_pool = []
        for item_id in all_item_ids:
            if item_id not in popular_ids:
                continue
            it = id_to_item[item_id]
            if it.major in avoid_majors:
                continue
            pop_pool.append(item_id)
        for item_id in _pick_from_pool(pop_pool, k_pop, chosen):
            chosen.add(item_id)
            picked_groups[item_id] = "popular"

        weak_pool: List[str] = []
        for item_id in all_item_ids:
            it = id_to_item[item_id]
            if item_id in popular_ids:
                continue
            if it.major in excluded_majors or it.sub in avoid_subs:
                continue
            weak_pool.append(item_id)

        for item_id in _pick_from_pool(weak_pool, k_weak, chosen):
            chosen.add(item_id)
            picked_groups[item_id] = "weak"

        # 회피/제약 풀
        avoid_pool: List[str] = []
        for item_id in all_item_ids:
            it = id_to_item[item_id]
            if it.major in avoid_majors or it.sub in avoid_subs:
                avoid_pool.append(item_id)

        for item_id in _pick_from_pool(avoid_pool, k_avoid, chosen):
            chosen.add(item_id)
            picked_groups[item_id] = "avoid"

        # 노이즈 풀
        noise_pool = [
            item_id
            for item_id in all_item_ids
            if id_to_item[item_id].major not in avoid_majors and id_to_item[item_id].sub not in avoid_subs
        ]
        for item_id in _pick_from_pool(noise_pool, k_noise, chosen):
            chosen.add(item_id)
            picked_groups[item_id] = "noise"

        # 브리지 아이템 최소 포함 보장
        bridge_ids = [it.item_id for it in items if it.is_bridge]
        bridge_chosen = {i for i in chosen if id_to_item[i].is_bridge}
        if bridge_ids and len(bridge_chosen) < BRIDGE_MIN:
            needed = min(BRIDGE_MIN - len(bridge_chosen), len(bridge_ids))
            remaining_bridge = [i for i in bridge_ids if i not in chosen]
            random.shuffle(remaining_bridge)
            add_bridge = remaining_bridge[:needed]
            for item_id in add_bridge:
                chosen.add(item_id)
                picked_groups[item_id] = "main"

            # keep total size stable by removing non-bridge items
            overflow = max(0, len(chosen) - target_n)
            if overflow > 0:
                removable = [i for i in chosen if not id_to_item[i].is_bridge]
                random.shuffle(removable)
                for item_id in removable[:overflow]:
                    chosen.remove(item_id)
                    picked_groups.pop(item_id, None)

        # CSV 행 생성(회피는 1~2점으로 명시)
        for item_id in chosen:
            it = id_to_item[item_id]
            ib = item_bias[item_id]
            group = picked_groups.get(item_id, "noise")

            if group == "avoid":
                rating = round_to_int_rating(random.uniform(1.0, 2.2))
            else:
                rating = _score_by_group(group, ub, ib)

            rows.append([
                member_id,
                item_id,
                str(rating),
                persona,
                neighbor,
                (constraint if constraint is not None else ""),
                it.major,
                it.sub,
                it.name,
                it.name,
                "1" if it.is_bridge else "0",
            ])

    return rows


def save_csv(path: Path, header: List[str], rows: List[List[str]]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def main():
    """CSV 생성 진입점."""
    random.seed(SEED)

    init_categories_from_db()

    items, item_bias, item_pop = make_items(CLASSIFIED_FOOD_PATH)
    members, member_persona, member_bias, member_constraint, member_activity, member_profile = make_members()

    sub_to_major = {}
    for major, subs in SUBCATEGORIES_BY_MAJOR.items():
        for sub in subs:
            sub_to_major[sub] = major

    def _pick_neighbor_avoiding(persona: str, avoid_set: set, favorite_set: set) -> str:
        excluded = set(avoid_set) | set(favorite_set) | {persona}
        candidates = [c for c in NEIGHBORS.get(persona, []) if c not in excluded]
        if not candidates:
            candidates = [c for c in CATEGORIES if c not in excluded]
        if not candidates:
            return pick_neighbor_category(persona)
        return random.choice(candidates)

    # Persist neighbor per member (sampled once here for repeatability), avoiding profile dislikes
    member_neighbor = {}
    for u in members:
        persona = member_persona[u]
        profile = member_profile.get(u, {"favorite_subs": [], "avoid_subs": []})
        avoid_set = {sub_to_major.get(s) for s in profile.get("avoid_subs", []) if sub_to_major.get(s)}
        favorite_set = {sub_to_major.get(s) for s in profile.get("favorite_subs", []) if sub_to_major.get(s)}
        if favorite_set & avoid_set:
            favorite_set -= avoid_set
        member_neighbor[u] = _pick_neighbor_avoiding(persona, avoid_set, favorite_set)

    # Ensure constraint does not overlap persona/neighbor while honoring profile rules
    for u in members:
        persona = member_persona[u]
        neighbor = member_neighbor[u]
        constraint = member_constraint.get(u)
        if constraint not in (persona, neighbor):
            continue

        profile = member_profile.get(u, {"favorite_subs": [], "avoid_subs": []})
        avoid_list = [
            sub_to_major.get(s)
            for s in profile.get("avoid_subs", [])
            if sub_to_major.get(s) and sub_to_major.get(s) not in (persona, neighbor)
        ]

        if profile.get("avoid_subs"):
            member_constraint[u] = random.choice(avoid_list) if avoid_list else None
        else:
            candidates = [c for c in CONSTRAINT_CANDIDATES if c not in (persona, neighbor)]
            member_constraint[u] = random.choice(candidates) if candidates else None

    ratings = generate_ratings(
        items, item_bias, item_pop,
        members, member_persona, member_bias, member_constraint, member_activity, member_profile, member_neighbor
    )

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    save_csv(
        DATA_DIR / "members.csv",
        ["member_id", "persona_major", "neighbor_major", "constraint_major", "member_bias", "activity_n", "profile"],
        [
            [
                u,
                member_persona[u],
                member_neighbor[u],
                (member_constraint[u] if member_constraint[u] else ""),
                f"{member_bias[u]:.3f}",
                str(member_activity[u]),
                member_profile[u]["name"],
            ]
            for u in members
        ],
    )
    members_df = pd.read_csv(DATA_DIR / "members.csv")
    assert not (members_df["neighbor_major"] == members_df["constraint_major"]).any()
    assert not (members_df["persona_major"] == members_df["constraint_major"]).any()
    assert not (members_df["neighbor_major"] == members_df["persona_major"]).any()

    save_csv(
        DATA_DIR / "ratings.csv",
        [
            "member_id",
            "product_id",
            "rating",
            "persona_major",
            "neighbor_major",
            "constraint_major",
            "item_major",
            "item_sub",
            "item_name",
            "context",
            "is_bridge",
        ],
        ratings,
    )

    # Stats: per-user count, per-item count, rating dist, overlap estimate
    ratings_df = pd.DataFrame(ratings, columns=[
        "member_id",
        "product_id",
        "rating",
        "persona_major",
        "neighbor_major",
        "constraint_major",
        "item_major",
        "item_sub",
        "item_name",
        "context",
        "is_bridge",
    ])
    per_user = ratings_df.groupby("member_id")["product_id"].count()
    per_item = ratings_df.groupby("product_id")["member_id"].count()

    user_min = int(per_user.min()) if not per_user.empty else 0
    user_p50 = int(per_user.median()) if not per_user.empty else 0
    user_max = int(per_user.max()) if not per_user.empty else 0

    item_min = int(per_item.min()) if not per_item.empty else 0
    item_p50 = int(per_item.median()) if not per_item.empty else 0
    item_p90 = int(per_item.quantile(0.9)) if not per_item.empty else 0
    item_max = int(per_item.max()) if not per_item.empty else 0

    rating_counts = ratings_df["rating"].astype(int).value_counts().to_dict()

    user_items = {
        uid: set(grp["product_id"].tolist())
        for uid, grp in ratings_df.groupby("member_id")
    }
    user_ids = list(user_items.keys())
    pair_count = 0
    shared_sum = 0
    pair_samples = 200
    rng = random.Random(SEED)
    if len(user_ids) >= 2:
        for _ in range(pair_samples):
            u1, u2 = rng.sample(user_ids, 2)
            shared_sum += len(user_items[u1] & user_items[u2])
            pair_count += 1
    overlap_avg = (shared_sum / pair_count) if pair_count else 0.0

    # Verify neighbor/persona/constraint consistency between members.csv and ratings.csv
    members_map = {}
    with (DATA_DIR / "members.csv").open("r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            members_map[row["member_id"]] = {
                "persona_major": row.get("persona_major", ""),
                "neighbor_major": row.get("neighbor_major", ""),
                "constraint_major": row.get("constraint_major", ""),
            }

    mismatches = 0
    constraint_counts = {}
    total_counts = {}
    with (DATA_DIR / "ratings.csv").open("r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            uid = row.get("member_id")
            if uid not in members_map:
                continue
            if row.get("neighbor_major", "") != members_map[uid]["neighbor_major"]:
                mismatches += 1
                break
            total_counts[uid] = total_counts.get(uid, 0) + 1
            if row.get("item_major", "") == members_map[uid]["constraint_major"] and members_map[uid]["constraint_major"]:
                constraint_counts[uid] = constraint_counts.get(uid, 0) + 1

    assert mismatches == 0, "neighbor_major mismatch between members.csv and ratings.csv"

    for uid, cols in members_map.items():
        persona = (cols.get("persona_major") or "").strip()
        neighbor = (cols.get("neighbor_major") or "").strip()
        constraint = (cols.get("constraint_major") or "").strip()

        if persona and neighbor:
            assert persona != neighbor, f"persona_major equals neighbor_major for {uid}"
        if constraint:
            assert constraint != persona, f"constraint_major equals persona_major for {uid}"
            assert constraint != neighbor, f"constraint_major equals neighbor_major for {uid}"


    print("✨ MF 데이터가 생성되었습니다.")


if __name__ == "__main__":
    main()
