import csv
import json
import sys
from pathlib import Path
from datetime import datetime


# Ensure app modules (database.py, models.py) are importable
# This file lives in backend/app/data so parents[1] is the `app` folder.
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

import database
import models

CATEGORY_MAP = {
    "쌀류": 1,
    "면류": 2,
    "떡류": 3,
    "곡류/두류": 4,
    "가루류": 5,
    "즉석식품": 6,
    "소고기": 7,
    "돼지고기": 8,
    "닭/오리/기타": 9,
    "해산물": 10,
    "계란": 11,
    "두부/유부": 12,
    "잎채소": 13,
    "근채류": 14,
    "과채류": 15,
    "버섯류": 16,
    "과일": 17,
    "냉동과일": 18,
    "채소/기타": 19,
    "생수/탄산수": 20,
    "음료/전통주": 21,
    "우유": 22,
    "두유": 23,
    "요거트": 24,
    "치즈": 25,
    "장류": 26,
    "액젓": 27,
    "식용유/기름": 28,
    "소스": 29,
    "드레싱": 30,
    "식초/소금/설탕/향신료": 31,
    "당류/액": 32,
    "깨": 33,
    "김치/젓갈": 34,
    "김": 35,
    "통조림": 36,
    "햄/소시지/베이컨": 37,
    "만두/떡볶이/순대": 38,
    "시리얼/프로틴바": 39,
    "빵/케이크/도너츠": 40,
    "견과류/건과일/잼/꿀": 41,
    "기타가공식": 42,
}

# # ==== 가데이터용 ====
# CATEGORY_MAP = {
#     "면류": 1,
#     "가루류": 2,
#     "즉석식품": 3,
#     "닭/오리/기타": 4,
#     "해산물": 5,
#     "계란": 6,
#     "두부/유부": 7,
#     "근채류": 8,
#     "과채류": 9,
#     "버섯류": 10,
#     "생수/탄산수": 11,
#     "우유": 12,
#     "치즈": 13,
#     "장류": 14,
#     "식용유/기름": 15,
#     "소스": 16,
#     "식초/소금/설탕/향신료": 17,
#     "당류/액": 18,
#     "액젓": 19,
#     "견과류/건과일/잼/꿀": 20,
#     "기타가공식": 21
# }


def build_subcategory_lookup(classified_json_path: Path):
    with classified_json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # Build mapping: product_name_value -> subcategory_name
    lookup = {}
    for top_k, subcats in data.items():

        if not isinstance(subcats, dict):
            continue
        for subcat_name, mapping in subcats.items():
            # mapping is dict of code -> display name
            if isinstance(mapping, dict):
                for code, disp in mapping.items():
                    lookup[disp] = subcat_name
            # also map the subcategory name itself
            lookup[subcat_name] = subcat_name

    return lookup


def map_category(product_category_name: str, lookup: dict, default_id: int = 21):
    subcat = lookup.get(product_category_name)
    if subcat:
        return CATEGORY_MAP.get(subcat, default_id)
    # try exact match to keys in CATEGORY_MAP (some CSV rows already use keys)
    if product_category_name in CATEGORY_MAP:
        return CATEGORY_MAP[product_category_name]
    return default_id


def normalize_images(img_field: str) -> str:
    if not img_field:
        return None
    # CSV uses newlines between URLs; normalize to pipe-separated single-line string
    return "|".join([s.strip() for s in img_field.splitlines() if s.strip()])


# def import_csv(csv_path: Path, classified_json_path: Path, chunk_size: int = 1000):
#     lookup = build_subcategory_lookup(classified_json_path)
#     session = database.SessionLocal()

#     objs = []
#     inserted = 0
#     with csv_path.open("r", encoding="utf-8") as fh:
#         reader = csv.DictReader(fh)
#         for row in reader:
#             try:
#                 csv_cat_name = (row.get("category_name") or "").strip()
#                 new_cat_id = map_category(csv_cat_name, lookup)

#                 title = (row.get("title") or "").strip()
#                 name = (row.get("category_name") or "").strip() or title[:100]

#                 price_raw = (row.get("price") or "0").strip()
#                 try:
#                     price = int(float(price_raw))
#                 except Exception:
#                     price = 0

#                 main_thumb = (row.get("main_thumbnail") or "").strip() or None
#                 detail_images = normalize_images(row.get("detail_images") or "")

#                 created_at = None
#                 dt = (row.get("crawling_dt") or "").strip()
#                 if dt:
#                     try:
#                         created_at = datetime.strptime(dt, "%Y-%m-%d %H:%M")
#                     except Exception:
#                         created_at = None

#                 p = models.Product(
#                     category_id=new_cat_id,
#                     name=name,
#                     title=title[:300],
#                     price=price,
#                     main_thumbnail=main_thumb,
#                     detail_images=detail_images,
#                     stock=0,
#                     is_active=True,
#                     created_at=created_at,
#                 )

#                 objs.append(p)

#                 if len(objs) >= chunk_size:
#                     session.bulk_save_objects(objs)
#                     session.commit()
#                     inserted += len(objs)
#                     print(f"Inserted {inserted} rows so far...")
#                     objs = []

#             except Exception as e:
#                 print("Skipping row due to error:", e)
#                 continue

def import_csv(csv_path: Path, classified_json_path: Path, chunk_size: int = 1000, limit: int = 300):
    lookup = build_subcategory_lookup(classified_json_path)
    session = database.SessionLocal()

    objs = []
    inserted = 0
    processed_count = 0  # 읽은 행수를 저장할 변수 추가

    with csv_path.open("r", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        next(reader)  # 첫 줄 헤더 건너뛰기

        for row in reader:
            # 300개 제한 체크
            # if processed_count >= limit:
            #     break
                
            try:
                csv_cat_name = (row.get("category_name") or "").strip()
                new_cat_id = map_category(csv_cat_name, lookup)

                title = (row.get("title") or "").strip()
                name = (row.get("category_name") or "").strip() or title[:100]

                price_raw = (row.get("price") or "0").strip()
                try:
                    price = int(float(price_raw))
                except Exception:
                    price = 0

                main_thumb = (row.get("main_thumbnail") or "").strip() or None
                detail_images = normalize_images(row.get("detail_images") or "")

                created_at = None
                dt = (row.get("crawling_dt") or "").strip()
                if dt:
                    try:
                        created_at = datetime.strptime(dt, "%Y-%m-%d %H:%M")
                    except Exception:
                        created_at = None

                p = models.Product(
                    category_id=new_cat_id,
                    name=name,
                    title=title[:300],
                    price=price,
                    main_thumbnail=main_thumb,
                    detail_images=detail_images,
                    stock=0,
                    is_active=True,
                    created_at=created_at,
                )

                objs.append(p)
                # processed_count += 1 # 카운트 증가

                # 설정한 chunk_size에 도달하면 DB에 저장
                if len(objs) >= chunk_size:
                    session.bulk_save_objects(objs)
                    session.commit()
                    inserted += len(objs)
                    print(f"Inserted {inserted} rows...")
                    objs = []

            except Exception as e:
                print(f"Error in row: {e}")
                continue

    # 300개 미만이거나 chunk_size에 걸리지 않고 남은 데이터 저장
    if objs:
        session.bulk_save_objects(objs)
        session.commit()
        inserted += len(objs)

    session.close()
    print(f"Done. Total inserted: {inserted} (Limited to {limit})")

if __name__ == "__main__":
    base = Path(__file__).resolve().parents[1]
    data_dir = base / "data"
    csv_file = data_dir / "product_data_merged.csv"
    classified_json = data_dir / "classified_food.json"

    if not csv_file.exists():
        print("CSV file not found:", csv_file)
        sys.exit(1)

    if not classified_json.exists():
        print("classified_food.json not found:", classified_json)
        sys.exit(1)

    import_csv(csv_file, classified_json)
