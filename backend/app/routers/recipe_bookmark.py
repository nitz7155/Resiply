from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Recipe, RecipeBookmark, Member
from deps.auth import get_current_member

router = APIRouter(prefix="/api/recipe", tags=["Recipe Bookmark"])

@router.get("/bookmarks")
def list_bookmarks(
    db: Session = Depends(get_db),
    user: Member = Depends(get_current_member),
):
    rows = (
        db.query(RecipeBookmark)
        .filter(RecipeBookmark.user_id == user.id)
        .order_by(RecipeBookmark.created_at.desc())
        .all()
    )

    # 프론트가 바로 쓰기 좋게 Recipe까지 같이 내려주는 형태 (추천)
    recipe_ids = [r.recipe_id for r in rows]
    recipes = (
        db.query(Recipe)
        .filter(Recipe.id.in_(recipe_ids))
        .all()
    )
    by_id = {r.id: r for r in recipes}

    return [
        {
            "id": row.id,
            "recipe_id": row.recipe_id,
            "created_at": row.created_at,
            "recipe": {
                "id": by_id[row.recipe_id].id,
                "name": by_id[row.recipe_id].name,
                "time": by_id[row.recipe_id].time,
                "thumbnail": by_id[row.recipe_id].thumbnail,
            } if by_id.get(row.recipe_id) else None
        }
        for row in rows
        if by_id.get(row.recipe_id)  # 삭제된 레시피 등 예외 방지
    ]


@router.post("/{recipe_id}/bookmark/toggle")
def toggle_bookmark(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: Member = Depends(get_current_member),
):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    existing = (
        db.query(RecipeBookmark)
        .filter(
            RecipeBookmark.user_id == user.id,
            RecipeBookmark.recipe_id == recipe_id,
        )
        .first()
    )

    if existing:
        db.delete(existing)
        db.commit()
        return {"bookmarked": False}

    bm = RecipeBookmark(user_id=user.id, recipe_id=recipe_id)
    db.add(bm)
    db.commit()
    return {"bookmarked": True}
