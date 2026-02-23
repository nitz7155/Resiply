from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func,
    CheckConstraint, UniqueConstraint, Index, Date, text, event, inspect
)
from sqlalchemy.orm import relationship, joinedload
from pgvector.sqlalchemy import Vector
from database import Base, SessionLocal

class Member(Base):
    __tablename__ = "member"

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'user')", name="check_member_role"),
        CheckConstraint("type IN ('kakao', 'naver')", name="check_social_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    login_id = Column(String(100), unique=True, nullable=False)
    type = Column(String(10), nullable=False)
    phone = Column(String(20), nullable=True)
    email = Column(String(200), nullable=True)
    birthday = Column(String(10), nullable=True)
    role = Column(String(20), default="user", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    is_deleted = Column(Boolean, default=False)
    address = Column(Text, nullable=True)

    social_accounts = relationship("SocialAccount", back_populates="member", cascade="all, delete-orphan")
    sessions = relationship("AuthSession", back_populates="member", cascade="all, delete-orphan")
    chat_logs = relationship("ChatLog", back_populates="member")
    orders = relationship("Order", back_populates="member")
    wishlists = relationship("Wishlist", back_populates="member", cascade="all, delete-orphan")
    recipe_bookmarks = relationship("RecipeBookmark", back_populates="member", cascade="all, delete-orphan")
    tastes = relationship("Taste", back_populates="member", cascade="all, delete-orphan")
    recipe_tip = relationship("RecipeTip", back_populates="member", cascade="all, delete-orphan")

class SocialAccount(Base):
    __tablename__ = "social_account"

    __table_args__ = (
        CheckConstraint("provider IN ('kakao', 'naver', 'google')", name="check_social_provider"),
        UniqueConstraint("member_id", "provider", name="uq_social_member_provider"),
        UniqueConstraint("provider", "provider_user_id", name="uq_social_provider_userid"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id"), nullable=False)

    provider = Column(String(20), nullable=False)          # 'kakao' | 'naver' | 'google'
    provider_user_id = Column(String(255), nullable=False) # 카카오 id 등

    email = Column(String(200), nullable=True)
    display_name = Column(String(100), nullable=True)

    linked_at = Column(DateTime, server_default=func.now())
    unlinked_at = Column(DateTime, nullable=True)

    member = relationship("Member", back_populates="social_accounts")
    tokens = relationship("SocialToken", back_populates="social_account", cascade="all, delete-orphan")

class SocialToken(Base):
    __tablename__ = "social_token"

    id = Column(Integer, primary_key=True, autoincrement=True)
    social_account_id = Column(Integer, ForeignKey("social_account.id"), nullable=False)

    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    social_account = relationship("SocialAccount", back_populates="tokens")

class AuthSession(Base):
    __tablename__ = "auth_session"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), unique=True, nullable=False)  # UUID string
    member_id = Column(Integer, ForeignKey("member.id"), nullable=False)

    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    member = relationship("Member", back_populates="sessions")

class MajorCategory(Base):
    __tablename__ = "major_category"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)

    categories = relationship("Category", back_populates="major_category")

class Category(Base):
    __tablename__ = "category"

    id = Column(Integer, primary_key=True, autoincrement=True)
    major_category_id = Column(Integer, ForeignKey("major_category.id"), nullable=False)
    name = Column(String(100), nullable=False)

    major_category = relationship("MajorCategory", back_populates="categories")
    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "product"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    name = Column(String(50), nullable=False)
    title = Column(String(300), nullable=False)
    price = Column(Integer, default=0)
    main_thumbnail = Column(Text, nullable=True)
    detail_images = Column(Text, nullable=True)
    stock = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    is_active = Column(Boolean, nullable=False, server_default=text('true'))
    embedding = Column(Vector(1024), nullable=True)
    description = Column(Text, nullable=True)

    category = relationship("Category", back_populates="products")
    recipe_links = relationship("RecipeProduct", back_populates="product")
    wishlisted_by = relationship("Wishlist", back_populates="product", cascade="all, delete-orphan")

class Recipe(Base):
    __tablename__ = "recipe"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    ingredient = Column(Text, nullable=True)
    time = Column(String(50), nullable=True)
    thumbnail = Column(Text, nullable=True)
    embedding = Column(Vector(1024), nullable=True)
    description = Column(Text, nullable=True)

    product_links = relationship("RecipeProduct", back_populates="recipe")
    steps = relationship("RecipeStep", back_populates="recipe", order_by="RecipeStep.step_number")
    bookmarked_by = relationship("RecipeBookmark", back_populates="recipe", cascade="all, delete-orphan")
    recipe_tip = relationship("RecipeTip", back_populates="recipe", cascade="all, delete-orphan")

class RecipeBookmark(Base):
    __tablename__ = "recipe_bookmark"

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id", ondelete="CASCADE"), nullable=False)
    recipe_id = Column(Integer, ForeignKey("recipe.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("member_id", "recipe_id", name="uq_recipe_bookmark_member_recipe"),
    )

    member = relationship("Member", back_populates="recipe_bookmarks")
    recipe = relationship("Recipe", back_populates="bookmarked_by")

class RecipeProduct(Base):
    __tablename__ = "recipe_product"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id = Column(Integer, ForeignKey("recipe.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("product.id"))
    ingredient = Column(Text, nullable=True)
    embedding = Column(Vector(1024), nullable=True)

    recipe = relationship("Recipe", back_populates="product_links")
    product = relationship("Product", back_populates="recipe_links")

class RecipeStep(Base):
    __tablename__ = "recipe_step"

    id = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id = Column(Integer, ForeignKey("recipe.id"), nullable=False)
    step_number = Column(Integer, nullable=False)
    description = Column(Text, nullable=True)
    url = Column(Text, nullable=True)

    recipe = relationship("Recipe", back_populates="steps")

class RecipeTip(Base):
    __tablename__ = "recipe_tip"
    __table_args__ = (
        UniqueConstraint("member_id", "recipe_id", name="uq_recipe_tip_member_recipe"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id"), nullable=False)
    recipe_id = Column(Integer, ForeignKey("recipe.id"), nullable=False)
    tips = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    member = relationship("Member", back_populates="recipe_tip")
    recipe = relationship("Recipe", back_populates="recipe_tip")

class Taste(Base):
    __tablename__ = "taste"

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id"), nullable=False)
    like = Column(Text, nullable=True)
    dislike = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    member = relationship("Member", back_populates="tastes")

class ChatLog(Base):
    __tablename__ = "chat_log"

    __table_args__ = (
        CheckConstraint("type IN ('main', 'recipe')", name="check_chat_log_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id"), nullable=False)
    title = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    is_deleted = Column(Boolean, default=False)
    type = Column(String(20), default="main", nullable=False)

    member = relationship("Member", back_populates="chat_logs")
    messages = relationship("ChatMessage", back_populates="chat_log", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_message"

    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="check_chat_message_role"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_log_id = Column(Integer, ForeignKey("chat_log.id"), nullable=False)
    content = Column(Text, nullable=False)
    role = Column(String(20), default="user", nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    chat_log = relationship("ChatLog", back_populates="messages")
    ai_meals = relationship("AiMeal", back_populates="request", cascade="all, delete-orphan")

class Order(Base):
    __tablename__ = "order"

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id"), nullable=False)
    total_price = Column(Integer, default=0)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, server_default=func.now())

    member = relationship("Member", back_populates="orders")
    order_details = relationship("OrderDetail", back_populates="order", cascade="all, delete-orphan")

class OrderDetail(Base):
    __tablename__ = "order_detail"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("order.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("product.id"), nullable=False)
    quantity = Column(Integer, default=1)
    product_total_price = Column(Integer, default=0)

    order = relationship("Order", back_populates="order_details")
    product = relationship("Product")
    
class CookingTip(Base):
    __tablename__ = "cooking_tip"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    main_thumbnail = Column(Text, nullable=True)
    intro_summary = Column(Text, nullable=True)
    content_steps = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    steps = relationship("CookingStep", back_populates="cooking_tip", order_by="CookingStep.step_number")

class CookingStep(Base):
    __tablename__ = "cooking_step"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cooking_tip_id = Column(Integer, ForeignKey("cooking_tip.id"),nullable=False)
    step_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    url = Column(Text, nullable=True)

    cooking_tip = relationship("CookingTip",back_populates="steps")

class ProductReview(Base):
    __tablename__ = "product_review"

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("product.id"), nullable=False)
    order_detail_id = Column(Integer, ForeignKey("order_detail.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    url = Column(Text, nullable=True)
    rating = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="check_rating_range"),
    )

@event.listens_for(Base.metadata, "before_drop")
def drop_views(target, connection, **kw):
    connection.execute(text("DROP VIEW IF EXISTS recommend_view CASCADE;"))
    print("✅ recommend_view dropped successfully (before drop_all).")

class Recommend(Base):
    __tablename__ = "recommend_view"
    __table_args__ = {"info": {"is_view": True}}

    member_id = Column(Integer, primary_key=True)
    product_id = Column(Integer, primary_key=True)
    rating = Column(Integer)
    updated_at = Column(DateTime)

class Wishlist(Base):
    __tablename__ = "wishlist"

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("member.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("product.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("member_id", "product_id", name="uq_wishlist_member_product"),
        Index("ix_wishlist_member_id", "member_id"),
        Index("ix_wishlist_product_id", "product_id"),
    )

    member = relationship("Member", back_populates="wishlists")
    product = relationship("Product")

class AiMeal(Base):
    __tablename__ = "ai_meal"
    
    id = Column(Integer, primary_key=True)
    request_id = Column(Integer, ForeignKey("chat_message.id"), nullable=False)
    recipe_id = Column(Integer, ForeignKey("recipe.id"), nullable=False)
    meal_date = Column(Date, nullable=False)
    meal_type = Column(String(20), nullable=False)  # breakfast, lunch, dinner
    status = Column(String(50), default='pending')  # pending, approved
    created_at = Column(DateTime, server_default=func.now())
    approved_at = Column(DateTime)
    
    __table_args__ = (
        CheckConstraint("meal_type IN ('아침', '점심', '저녁')"),
        UniqueConstraint('request_id', 'meal_date', 'meal_type'),
    )
    request = relationship("ChatMessage", back_populates="ai_meals")
    calendar_entries = relationship("MealCalendar", back_populates="ai_meal", cascade="all, delete-orphan")

class MealCalendar(Base):
    __tablename__ = "meal_calendar"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("member.id"), nullable=False)
    meal_date = Column(Date, nullable=False)
    meal_type = Column(String(20), nullable=False)
    ai_meal_id = Column(Integer, ForeignKey("ai_meal.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint("meal_type IN ('아침', '점심', '저녁')"),
        UniqueConstraint('user_id', 'meal_date', 'meal_type'),
    )
    
    ai_meal = relationship("AiMeal", back_populates="calendar_entries")

@event.listens_for(AiMeal, 'after_update')
def ai_meal_after_update(mapper, connection, target):
    try:
        # 1. 상태가 approved로 변경되었는지 확인
        hist = inspect(target).attrs.status.history
        if not (hist.has_changes() and hist.added and hist.added[0] == 'approved'):
            return

        session = SessionLocal()
        try:
            # 2. Member ID 찾기
            cm = session.query(ChatMessage).options(joinedload(ChatMessage.chat_log)).filter(ChatMessage.id == target.request_id).first()
            member_id = None
            if cm and cm.chat_log:
                member_id = cm.chat_log.member_id

            if not member_id:
                return

            # 3. [핵심] 덮어쓰기 로직 (Upsert)
            # 해당 날짜, 해당 끼니에 이미 등록된 캘린더 일정이 있는지 확인
            existing = session.query(MealCalendar).filter_by(
                user_id=member_id,
                meal_date=target.meal_date,
                meal_type=target.meal_type
            ).first()

            if existing:
                # [CASE A] 이미 존재하면 -> 레시피(ai_meal_id)만 교체 (UPDATE)
                print(f"🔄 Updating existing calendar entry: {target.meal_date} {target.meal_type}")
                existing.ai_meal_id = target.id
                existing.updated_at = func.now()
                # session.add는 dirty check에 의해 자동 업데이트되지만 명시적으로 호출 가능
                session.add(existing)
            else:
                # [CASE B] 없으면 -> 새로 생성 (INSERT)
                print(f"✅ Creating new calendar entry: {target.meal_date} {target.meal_type}")
                cal = MealCalendar(
                    user_id=member_id,
                    meal_date=target.meal_date,
                    meal_type=target.meal_type,
                    ai_meal_id=target.id
                )
                session.add(cal)

            session.commit()
        except Exception as inner_e:
            print(f"Error inside event listener: {inner_e}")
            session.rollback()
        finally:
            session.close()
    except Exception as e:
        print(f"Warning: failed to create/update MealCalendar on AiMeal approval: {e}")