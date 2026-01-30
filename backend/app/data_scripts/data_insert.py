import json
import pandas as pd
import os
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError
from database import SessionLocal, engine
from models import MajorCategory, Category, Product, Recipe, RecipeProduct, RecipeStep

def data_insert_func():
    CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
    JSON_PATH = os.path.join(CURRENT_DIR, 'data_classified_food.json')
    COUPANG_CSV_PATH = os.path.join(CURRENT_DIR, 'product_data.csv')
    RECIPE_CSV_PATH = os.path.join(CURRENT_DIR, 'data_10000recipe.csv')
    db = SessionLocal()
    print(f"📂 데이터 파일 경로 확인: {JSON_PATH}") # 경로 확인용 출력

    try:
        # 중복 방지 체크
        if db.query(MajorCategory).first():
            print("✅ 데이터가 이미 존재합니다. 초기화 작업을 건너뜁니다.")
            return

        print("🔄 데이터 초기화 작업 시작...")

        # -------------------------------------------------------
        # 1. Major Category
        # -------------------------------------------------------
        # [수정] 위에서 만든 절대 경로 변수(JSON_PATH) 사용
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        major_categories = list(data.keys())
        data_to_insert = [{"name": m_cat} for m_cat in major_categories]

        stmt = insert(MajorCategory)
        db.execute(stmt, data_to_insert)
        db.commit()

        # -------------------------------------------------------
        # 2. Category
        # -------------------------------------------------------
        indexed_categories = [{i + 1: v} for i, (k, v) in enumerate(data.items())]
        data_to_insert_cat = list()
        temp_data_insert = list()

        for i_cat in indexed_categories:
            for k, v in i_cat.items():
                for vi_k, vi_v in v.items():
                    temp_data_insert.append({"major_category_id": k, "name": vi_k, "products": vi_v})
                    data_to_insert_cat.append({"major_category_id": k, "name": vi_k})

        stmt = insert(Category)
        db.execute(stmt, data_to_insert_cat)
        db.commit()

        # -------------------------------------------------------
        # 3. Product
        # -------------------------------------------------------
        category_items = []
        i = 1
        for d in temp_data_insert:
            category_items.append({i: d['products']})
            i += 1

        category_to_top = {}
        for c_items in category_items:
            for k, v in c_items.items():
                for v_k in v.keys():
                    category_to_top[v_k] = k

        # [수정] 절대 경로 변수 사용
        df = pd.read_csv(COUPANG_CSV_PATH)
        df['category_id'] = df['category_id'].astype(str).map(category_to_top)
        df.dropna(subset=['category_id'], inplace=True)
        df['category_id'] = df['category_id'].astype(int)

        # Normalize `detail_images` like insert_products.normalize_images:
        # - convert multi-line URLs into a single pipe-separated string
        # - strip whitespace and drop empty lines
        # - store None for empty/blank values
        def _normalize_images_field(x):
            if pd.isna(x):
                return None
            s = str(x)
            parts = [p.strip() for p in s.splitlines() if p.strip()]
            return "|".join(parts) if parts else None

        df['detail_images'] = df.get('detail_images').apply(_normalize_images_field)

        # Ensure main thumbnail empty strings become None
        df['main_thumbnail'] = df.get('main_thumbnail').apply(lambda v: v.strip() if isinstance(v, str) and v.strip() else None)

        df = df[['category_id', 'category_name', 'title', 'price', 'main_thumbnail', 'detail_images']]
        df = df.rename(columns={'category_name': 'name'})

        df.to_sql(name='product', con=engine, if_exists='append', index=False, method='multi', chunksize=100)

        # -------------------------------------------------------
        # 4. Recipe
        # -------------------------------------------------------
        # [수정] 절대 경로 변수 사용
        RECIPE_CNT = 60 # 1153

        df_recipe_raw = pd.read_csv(RECIPE_CSV_PATH)
        df_recipe_raw.drop_duplicates(subset=['Title'], inplace=True, ignore_index=True)
        df_recipe = df_recipe_raw.head(RECIPE_CNT).copy()
        df_recipe['Ingredient'] = df_recipe['Ingredient'].str.replace(r'-[^,]*', '', regex=True)
        df_recipe["Condiment"] = df_recipe["Condiment"].str.replace(r'-[^,]*', '', regex=True).fillna('')
        df_recipe["Full_Ingredient"] = df_recipe.apply(lambda x: f"{x['Ingredient']},{x['Condiment']}".strip(","), axis=1)
        df_recipe["Description"] = df_recipe["Description"].fillna('')

        df_recipe_insert = df_recipe[['Title', 'Full_Ingredient', 'Preparation_Time', 'Main_Thumbnail', 'Description']].copy()
        df_recipe_insert.columns = ['name', 'ingredient', 'time', 'thumbnail', 'description']

        df_recipe_insert.to_sql(name='recipe', con=engine, if_exists='append', index=False, method='multi', chunksize=100)

        # -------------------------------------------------------
        # 5. Recipe Product
        # -------------------------------------------------------
        df_recipe['recipe_id'] = range(1, RECIPE_CNT + 1)
        df_recipe['Full_Ingredient'] = df_recipe['Full_Ingredient'].str.split(',')
        df_recipe_product = df_recipe.explode('Full_Ingredient', ignore_index=True)
        df_recipe_product = df_recipe_product[['recipe_id', 'Full_Ingredient']]
        df_recipe_product.columns = ['recipe_id', 'ingredient']

        df_recipe_product.to_sql(name='recipe_product', con=engine, if_exists='append', index=False, method='multi', chunksize=100)

        # -------------------------------------------------------
        # 6. Recipe Step
        # -------------------------------------------------------
        df_recipe_step = df_recipe[['recipe_id', 'Steps']].copy()
        df_recipe_step['raw'] = df_recipe_step['Steps'].str.split('\n')
        df_recipe_step = df_recipe_step.explode('raw', ignore_index=True)

        split_raw_df = df_recipe_step['raw'].str.split('||', regex=False, expand=True)

        if split_raw_df.shape[1] == 3:
            split_raw_df.columns = ["step_number", "description", "url"]
        else:
            split_raw_df = split_raw_df.iloc[:, :3]
            split_raw_df.columns = ["step_number", "description", "url"]

        df_recipe_step_final = pd.concat([df_recipe_step['recipe_id'], split_raw_df], axis=1)

        df_recipe_step_final['step_number'] = df_recipe_step_final['step_number'].astype(str).str.replace('단계', '', regex=False)
        df_recipe_step_final = df_recipe_step_final[pd.to_numeric(df_recipe_step_final['step_number'], errors='coerce').notnull()]
        df_recipe_step_final['step_number'] = df_recipe_step_final['step_number'].astype(int)

        df_recipe_step_final.to_sql(name='recipe_step', con=engine, if_exists='append', index=False, method='multi',chunksize=500)

        print("🎉 모든 초기 데이터 삽입 완료!")

    except IntegrityError as e:
        db.rollback()
        print(f"⚠️ 데이터 중복/무결성 에러: {e}")
    except Exception as e:
        db.rollback()
        print(f"❌ 에러 발생: {e}")
        # 어떤 파일 경로에서 에러가 났는지 확인하기 위해 traceback 출력
        import traceback
        traceback.print_exc()
    finally:
        db.close()
