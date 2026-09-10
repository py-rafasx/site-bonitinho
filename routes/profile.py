import json
import uuid
from pathlib import Path

from flask import Blueprint, request, jsonify, session, send_from_directory
from PIL import Image, ImageOps
from config import Config
from db import db
from db.models import User, Upload, Follow, Block, Like, Comment
from utils.security import login_required
from utils.validation import normalize_username, validate_username

profile_bp = Blueprint("profile", __name__)


def _get_by_username(username):
    return User.query.filter(db.func.lower(User.username) == (username or "").lower()).first()


def _is_blocked(viewer_id, target_id):
    if not viewer_id:
        return False
    return Block.query.filter(
        ((Block.user_id == viewer_id) & (Block.blocked_id == target_id)) |
        ((Block.user_id == target_id) & (Block.blocked_id == viewer_id))
    ).first() is not None


def _blocked_ids():
    viewer_id = session.get("user_id")
    if not viewer_id:
        return set()
    rows = db.session.query(Block.user_id, Block.blocked_id).filter(
        (Block.user_id == viewer_id) | (Block.blocked_id == viewer_id)
    ).all()
    return {r.blocked_id if r.user_id == viewer_id else r.user_id for r in rows}


@profile_bp.route("/api/profile/<username>", methods=["GET"])
def get_profile(username):
    user = _get_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404

    viewer_id = session.get("user_id")
    blocked_by_me = False
    if viewer_id:
        blocked_by_me = Block.query.filter_by(user_id=viewer_id, blocked_id=user.id).first() is not None
        blocked_me = Block.query.filter_by(user_id=user.id, blocked_id=viewer_id).first() is not None
        if blocked_me:
            return jsonify({"error": "profile not available"}), 403

    is_me = viewer_id == user.id
    is_following = False
    if viewer_id and not is_me and not blocked_by_me:
        is_following = Follow.query.filter_by(
            follower_id=viewer_id, following_id=user.id
        ).first() is not None

    try:
        social = json.loads(user.social_links) if user.social_links else []
        if not isinstance(social, list):
            social = []
    except Exception:
        social = []
    try:
        hobbies = json.loads(user.hobbies) if user.hobbies else []
        if not isinstance(hobbies, list):
            hobbies = []
    except Exception:
        hobbies = []
    try:
        pinned = json.loads(user.pinned_details) if user.pinned_details else []
        if not isinstance(pinned, list):
            pinned = []
    except Exception:
        pinned = []
    return jsonify({
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name or user.username,
        "email": user.email if is_me else "",
        "avatar": user.avatar,
        "cover": user.cover or "",
        "color": user.color or "",
        "bio": user.bio or "",
        "birthday": user.birthday or "",
        "marital_status": user.marital_status or "",
        "category": user.category or "",
        "price": user.price or "",
        "hours": user.hours or "",
        "location": user.location or "",
        "social_links": social,
        "education": user.education or "",
        "hobbies": hobbies,
        "pinned_details": pinned,
        "created_at": user.created_at,
        "is_me": is_me,
        "is_following": is_following,
        "is_blocked": blocked_by_me,
        "followers_count": user.followers_count,
        "following_count": user.following_count,
        "posts_count": user.posts_count,
    })


@profile_bp.route("/api/profile/<username>/posts", methods=["GET"])
def get_profile_posts(username):
    user = _get_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404

    viewer_id = session.get("user_id")
    if _is_blocked(viewer_id, user.id):
        return jsonify({"posts": [], "total": 0, "page": 1, "has_more": False})

    page = request.args.get("page", 1, type=int)
    per_page = 12

    like_count = (
        db.session.query(db.func.count(Like.id))
        .filter(Like.image_name == Upload.image_name)
        .correlate(Upload)
        .scalar_subquery()
    )
    blocked = _blocked_ids()
    comment_count = (
        db.session.query(db.func.count(Comment.id))
        .filter(Comment.image_name == Upload.image_name)
        .correlate(Upload)
        .scalar_subquery()
    )
    if blocked:
        comment_count = (
            db.session.query(db.func.count(Comment.id))
            .filter(Comment.image_name == Upload.image_name, Comment.user_id.notin_(blocked))
            .correlate(Upload)
            .scalar_subquery()
        )

    query = (
        db.session.query(
            Upload,
            like_count.label("likes"),
            comment_count.label("comments"),
        )
        .filter(Upload.user_id == user.id, Upload.active == 1)
        .order_by(db.desc(Upload.created_at), db.desc(Upload.id))
    )
    total = query.count()
    rows = query.offset((page - 1) * per_page).limit(per_page).all()

    result = []
    post_index = {}
    for upload, likes, comments in rows:
        pid = upload.post_id or upload.image_name
        media = {
            "name": upload.image_name,
            "media_type": upload.media_type,
        }
        entry = {
            "post_id": upload.image_name if upload.eleicao else pid,
            "name": upload.image_name,
            "owner": user.username,
            "owner_display_name": user.display_name or user.username,
            "owner_id": user.id,
            "likes": likes,
            "comments": comments,
            "created_at": upload.created_at,
            "owner_avatar": user.avatar or "default-avatar.svg",
            "caption": upload.caption or "",
            "post_type": upload.post_type or "image",
            "nsfw": bool(upload.nsfw),
            "eleicao": bool(upload.eleicao),
            "media": [media],
        }
        if pid in post_index:
            grouped = result[post_index[pid]]
            grouped["media"].append(media)
            grouped["likes"] += likes
            grouped["comments"] += comments
        else:
            post_index[pid] = len(result)
            result.append(entry)

    return jsonify({
        "posts": result,
        "total": total,
        "page": page,
        "has_more": page * per_page < total,
    })


@profile_bp.route("/api/profile/<username>/followers", methods=["GET"])
def get_followers(username):
    user = _get_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    rows = (
        db.session.query(User.id, User.username, User.display_name, User.avatar, User.color)
        .join(Follow, Follow.follower_id == User.id)
        .filter(Follow.following_id == user.id)
        .all()
    )
    return jsonify([{"id": r.id, "username": r.username, "display_name": r.display_name or r.username, "avatar": r.avatar or "", "color": r.color or ""} for r in rows])


@profile_bp.route("/api/profile/<username>/following-list", methods=["GET"])
def get_following_list(username):
    user = _get_by_username(username)
    if not user:
        return jsonify({"error": "user not found"}), 404
    rows = (
        db.session.query(User.id, User.username, User.display_name, User.avatar, User.color)
        .join(Follow, Follow.following_id == User.id)
        .filter(Follow.follower_id == user.id)
        .all()
    )
    return jsonify([{"id": r.id, "username": r.username, "display_name": r.display_name or r.username, "avatar": r.avatar or "", "color": r.color or ""} for r in rows])


@profile_bp.route("/api/auth/profile", methods=["PUT"])
@login_required
def update_profile():
    user = User.query.get(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "session expired"}), 401

    data = request.get_json()

    if "username" in data:
        new_username = normalize_username(data["username"])
        ok, reason = validate_username(new_username)
        if not ok:
            return jsonify({"error": reason}), 400
        existing = User.query.filter(
            db.func.lower(User.username) == new_username, User.id != user.id
        ).first()
        if existing:
            return jsonify({"error": "username already taken"}), 409
        user.username = new_username
        session["username"] = new_username

    if "display_name" in data:
        display_name = (data["display_name"] or "").strip()[:30]
        user.display_name = display_name
        session["display_name"] = display_name or user.username

    if "email" in data:
        email = (data["email"] or "").strip().lower()[:120]
        if email and "@" not in email:
            return jsonify({"error": "email inválido"}), 400
        if email and User.query.filter(User.email == email, User.id != user.id).first():
            return jsonify({"error": "email já cadastrado"}), 409
        user.email = email

    if "avatar" in data:
        user.avatar = data["avatar"]
        session["avatar"] = data["avatar"]

    if "color" in data:
        user.color = (data["color"] or "").strip()
        session["color"] = user.color

    if "bio" in data:
        user.bio = (data["bio"] or "").strip()[:110]

    if "birthday" in data:
        user.birthday = (data["birthday"] or "").strip()

    if "marital_status" in data:
        user.marital_status = (data["marital_status"] or "").strip()

    if "category" in data:
        user.category = (data["category"] or "").strip()

    if "price" in data:
        user.price = (data["price"] or "").strip()

    if "hours" in data:
        user.hours = (data["hours"] or "").strip()

    if "location" in data:
        user.location = (data["location"] or "").strip()

    if "social_links" in data:
        links = data["social_links"]
        if not isinstance(links, list):
            return jsonify({"error": "social_links deve ser lista"}), 400
        clean = []
        for item in links[:5]:
            if not isinstance(item, dict):
                continue
            name = (item.get("name") or "").strip()[:30]
            url = (item.get("url") or "").strip()[:200]
            if not name or not url:
                continue
            if not (url.startswith("http://") or url.startswith("https://")):
                url = "https://" + url
            clean.append({"name": name, "url": url})
        user.social_links = json.dumps(clean)

    if "education" in data:
        user.education = (data["education"] or "").strip()[:200]

    if "hobbies" in data:
        hobbies = data["hobbies"]
        if isinstance(hobbies, str):
            # aceita string separada por vírgula
            hobbies = [h.strip() for h in hobbies.split(",") if h.strip()]
        if not isinstance(hobbies, list):
            hobbies = []
        clean_h = [str(h).strip()[:30] for h in hobbies[:10] if str(h).strip()]
        user.hobbies = json.dumps(clean_h)

    if "pinned_details" in data:
        pinned = data["pinned_details"]
        if not isinstance(pinned, list):
            pinned = []
        allowed = {"location","work","education","hobbies","contact","bio","birthday","joined"}
        clean_p = [p for p in pinned if p in allowed][:10]
        user.pinned_details = json.dumps(clean_p)

    db.session.commit()
    return jsonify({"ok": True})


@profile_bp.route("/api/auth/cover", methods=["POST", "DELETE"])
@login_required
def cover_upload():
    cover_dir = Config.BASE_DIR / "static" / "covers"
    cover_dir.mkdir(parents=True, exist_ok=True)
    user = User.query.get(session["user_id"])

    if request.method == "DELETE":
        old_name = user.cover
        user.cover = ""
        db.session.commit()
        if old_name:
            old_path = cover_dir / old_name
            if old_path.exists():
                old_path.unlink()
        return jsonify({"cover": ""})

    file = request.files.get("cover")
    if not file or not file.filename:
        return jsonify({"error": "no file"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return jsonify({"error": "invalid file type"}), 400

    if ext == ".gif":
        data = file.read()
        if len(data) > 1024 * 1024:
            return jsonify({"error": "GIF muito grande (max 1MB)"}), 400
        if not data.startswith(b"GIF8"):
            return jsonify({"error": "invalid image"}), 400
        name = f"{user.id}_{uuid.uuid4().hex[:8]}.gif"
        (cover_dir / name).write_bytes(data)
    else:
        name = f"{user.id}_{uuid.uuid4().hex[:8]}.webp"
        try:
            with Image.open(file.stream) as im:
                im = im.convert("RGB")
                im = ImageOps.exif_transpose(im)
                w, h = im.size
                target_ratio = 3.0
                current_ratio = w / h
                if current_ratio > target_ratio:
                    new_w = int(h * target_ratio)
                    left = (w - new_w) // 2
                    im = im.crop((left, 0, left + new_w, h))
                else:
                    new_h = int(w / target_ratio)
                    top = (h - new_h) // 2
                    im = im.crop((0, top, w, top + new_h))
                im = im.resize((1200, 400), Image.Resampling.LANCZOS)
                im.save(str(cover_dir / name), format="WEBP", quality=88, method=6)
        except Exception:
            return jsonify({"error": "invalid image"}), 400

    old_name = user.cover
    user.cover = name
    db.session.commit()

    if old_name:
        old_path = cover_dir / old_name
        if old_path.exists():
            old_path.unlink()

    return jsonify({"cover": name})


@profile_bp.route("/covers/<path:filename>")
def serve_cover(filename):
    return send_from_directory(Config.BASE_DIR / "static" / "covers", filename, max_age=604800)


@profile_bp.route("/api/auth/follow/<username>", methods=["POST"])
@login_required
def toggle_follow(username):
    target = _get_by_username(username)
    if not target:
        return jsonify({"error": "user not found"}), 404

    user_id = session["user_id"]
    if user_id == target.id:
        return jsonify({"error": "cannot follow yourself"}), 400

    existing = Follow.query.filter_by(follower_id=user_id, following_id=target.id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"following": False, "followers_count": target.followers_count})

    follow = Follow(follower_id=user_id, following_id=target.id)
    db.session.add(follow)
    db.session.commit()
    return jsonify({"following": True, "followers_count": target.followers_count})


@profile_bp.route("/api/auth/block/<username>", methods=["POST"])
@login_required
def toggle_block(username):
    target = _get_by_username(username)
    if not target:
        return jsonify({"error": "user not found"}), 404

    user_id = session["user_id"]
    if user_id == target.id:
        return jsonify({"error": "cannot block yourself"}), 400

    existing = Block.query.filter_by(user_id=user_id, blocked_id=target.id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"blocked": False})

    block = Block(user_id=user_id, blocked_id=target.id)
    db.session.add(block)

    existing_follow = Follow.query.filter(
        ((Follow.follower_id == user_id) & (Follow.following_id == target.id)) |
        ((Follow.follower_id == target.id) & (Follow.following_id == user_id))
    ).all()
    for f in existing_follow:
        db.session.delete(f)

    db.session.commit()
    return jsonify({"blocked": True})


@profile_bp.route("/api/auth/blocked", methods=["GET"])
@login_required
def list_blocked():
    user_id = session["user_id"]
    blocks = Block.query.filter_by(user_id=user_id).all()
    blocked_users = []
    for b in blocks:
        u = User.query.get(b.blocked_id)
        if u:
            blocked_users.append({"id": u.id, "username": u.username, "display_name": u.display_name or u.username, "avatar": u.avatar})
    return jsonify(blocked_users)


@profile_bp.route("/api/auth/following", methods=["GET"])
@login_required
def list_following():
    user_id = session["user_id"]
    rows = Follow.query.filter_by(follower_id=user_id).all()
    ids = [r.following_id for r in rows]
    return jsonify(ids)
