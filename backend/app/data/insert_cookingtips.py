import pandas as pd
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

import database
import models


def insert_cooking_tips(csv_path=None):
    """
    csv_path: Path or str pointing to cookingtip_data.csv
    """
    db = database.SessionLocal()

    check_tip = db.query(models.CookingTip).all()
    if check_tip:
        return print("❗이미 요리 팁이 존재합니다.")

    try:
        if csv_path is None:
            csv_path = 'cookingtip_data.csv'

        df = pd.read_csv(csv_path)

        for _, row in df.iterrows():
            title = row.get("Title") if "Title" in row else row.get("title")
            main_thumb = row.get("Main_Thumbnail") if "Main_Thumbnail" in row else row.get("main_thumbnail")
            intro = row.get("Intro_Summary") if "Intro_Summary" in row else row.get("intro_summary")
            content = row.get("Content_Steps") if "Content_Steps" in row else row.get("content_steps")

            new_tip = models.CookingTip(
                title=title,
                main_thumbnail=main_thumb if pd.notna(main_thumb) else None,
                intro_summary=intro if pd.notna(intro) else None,
                content_steps=content if pd.notna(content) else None,
            )
            db.add(new_tip)
            db.flush()

            pattern = r"\[(\d+)\]\s*(.*?)\s*\|\|\s*(https?://[^\s]+)"
            matches = re.findall(pattern, str(content or ""))
            for match in matches:
                try:
                    step_no = int(match[0])
                except Exception:
                    step_no = 0
                new_step = models.CookingStep(
                    cooking_tip_id=new_tip.id,
                    step_number=step_no,
                    content=match[1].strip(),
                    url=match[2].strip() if match[2] else None,
                )
                db.add(new_step)

        db.commit()
        print("✅ cooking tips inserted")
    except Exception as e:
        db.rollback()
        print(f"❌ 에러 발생: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

def insert_cookingtips_func():
    base = Path(__file__).resolve().parents[1]
    data_dir = base / "data"
    csv_file = data_dir / "cookingtip_data.csv"

    if not csv_file.exists():
        print("CSV file not found:", csv_file)
        sys.exit(1)

    insert_cooking_tips(csv_file)