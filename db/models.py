from db import db
from datetime import datetime


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.Text, nullable=False, unique=True)
    display_name = db.Column(db.Text, nullable=False, default="")
    email = db.Column(db.Text, nullable=False, default="")
    password = db.Column(db.Text, nullable=False)
    is_admin = db.Column(db.Integer, nullable=False, default=0)
    is_approved = db.Column(db.Integer, nullable=False, default=1)
    avatar = db.Column(db.Text, nullable=False, default="default-avatar.svg")
    cover = db.Column(db.Text, nullable=False, default="")
    color = db.Column(db.Text, nullable=False, default="")
    bio = db.Column(db.Text, nullable=False, default="")
    birthday = db.Column(db.Text, nullable=False, default="")
    marital_status = db.Column(db.Text, nullable=False, default="")
    category = db.Column(db.Text, nullable=False, default="")
    price = db.Column(db.Text, nullable=False, default="")
    hours = db.Column(db.Text, nullable=False, default="")
    location = db.Column(db.Text, nullable=False, default="")
    social_links = db.Column(db.Text, nullable=False, default="[]")
    education = db.Column(db.Text, nullable=False, default="")
    hobbies = db.Column(db.Text, nullable=False, default="[]")
    pinned_details = db.Column(db.Text, nullable=False, default="[]")
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))

    uploads = db.relationship("Upload", backref="owner", lazy=True, cascade="all, delete-orphan")
    likes = db.relationship("Like", backref="user", lazy=True, cascade="all, delete-orphan")
    comments = db.relationship("Comment", backref="author", lazy=True, cascade="all, delete-orphan")

    following = db.relationship(
        "User", secondary="follows",
        primaryjoin="User.id == follows.c.follower_id",
        secondaryjoin="User.id == follows.c.following_id",
        backref=db.backref("followers", lazy="dynamic"),
        lazy="dynamic",
    )

    @property
    def followers_count(self):
        return self.followers.count()

    @property
    def following_count(self):
        return self.following.count()

    @property
    def posts_count(self):
        return Upload.query.filter_by(user_id=self.id, active=1).count()


class Follow(db.Model):
    __tablename__ = "follows"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    follower_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    following_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
    __table_args__ = (db.UniqueConstraint("follower_id", "following_id"),)


class Block(db.Model):
    __tablename__ = "blocks"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
    __table_args__ = (db.UniqueConstraint("user_id", "blocked_id"),)


class Upload(db.Model):
    __tablename__ = "uploads"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    post_id = db.Column(db.Text, nullable=False, default="")
    image_name = db.Column(db.Text, nullable=False, unique=True)
    original_name = db.Column(db.Text, nullable=False)
    media_type = db.Column(db.Text, nullable=False, default="image")
    caption = db.Column(db.Text, nullable=False, default="")
    post_type = db.Column(db.Text, nullable=False, default="image")
    nsfw = db.Column(db.Integer, nullable=False, default=0)
    eleicao = db.Column(db.Integer, nullable=False, default=0)
    active = db.Column(db.Integer, nullable=False, default=1)
    # microseconds keep upload order deterministic for multi-file/ZIP uploads
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f"))


class Like(db.Model):
    __tablename__ = "likes"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    image_name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
    __table_args__ = (db.UniqueConstraint("user_id", "image_name"),)


class Comment(db.Model):
    __tablename__ = "comments"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    image_name = db.Column(db.Text, nullable=False)
    text = db.Column(db.Text, nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    media_name = db.Column(db.Text, nullable=False, default="")
    media_type = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class CommentLike(db.Model):
    __tablename__ = "comment_likes"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    comment_id = db.Column(db.Integer, db.ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
    __table_args__ = (db.UniqueConstraint("user_id", "comment_id"),)


class Round(db.Model):
    __tablename__ = "rounds"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    round_number = db.Column(db.Integer, nullable=False)
    cutoff = db.Column(db.Integer, nullable=False)
    finished_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class Setting(db.Model):
    __tablename__ = "settings"
    key = db.Column(db.Text, primary_key=True)
    value = db.Column(db.Text, nullable=False)


class PushToken(db.Model):
    __tablename__ = "push_tokens"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.Text, nullable=False, unique=True)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class PushNotification(db.Model):
    __tablename__ = "push_notifications"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.Text, nullable=False)
    body = db.Column(db.Text, nullable=False)
    image_name = db.Column(db.Text, nullable=False, default="")
    read = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class Winner(db.Model):
    __tablename__ = "winners"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    image_name = db.Column(db.Text, nullable=False, unique=True)
    caption = db.Column(db.Text, nullable=False, default="")
    number = db.Column(db.Integer, nullable=False, unique=True)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))


class RecoveryCode(db.Model):
    __tablename__ = "recovery_codes"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    code_hash = db.Column(db.Text, nullable=False)
    used = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.Text, nullable=False, default=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
