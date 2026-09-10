from flask import Blueprint, request, jsonify, session
from db import db
from db.models import User, Upload, Like, Setting, Block
from utils.security import login_required, get_setting
from config import Config

likes_bp = Blueprint("likes", __name__)


@likes_bp.route("/api/singlevote", methods=["GET"])
def single_vote_status():
    return jsonify({"enabled": get_setting("single_vote_mode") == "1"})


@likes_bp.route("/api/likes", methods=["GET"])
@login_required
def get_likes():
    rows = Like.query.filter_by(user_id=session["user_id"]).all()
    return jsonify({"likes": [r.image_name for r in rows]})


@likes_bp.route("/api/likers/<path:image_name>", methods=["GET"])
def get_likers(image_name):
    rows = (
        db.session.query(User.username, User.display_name, User.id.label("user_id"))
        .join(Like, Like.user_id == User.id)
        .filter(Like.image_name == image_name)
        .order_by(Like.created_at.asc())
        .all()
    )
    return jsonify([{"username": r.username, "display_name": r.display_name or r.username, "id": r.user_id} for r in rows])


@likes_bp.route("/api/likes/<path:image_name>", methods=["POST"])
@login_required
def toggle_like(image_name):
    existing = Like.query.filter_by(
        user_id=session["user_id"], image_name=image_name
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"liked": False})

    if get_setting("single_vote_mode") == "1":
        target = Upload.query.filter_by(image_name=image_name).first()
        if target and target.eleicao:
            eleicao_names = [
                r.image_name
                for r in db.session.query(Upload.image_name).filter(Upload.eleicao == 1).all()
            ]
            if eleicao_names:
                others = Like.query.filter(
                    Like.user_id == session["user_id"],
                    Like.image_name != image_name,
                    Like.image_name.in_(eleicao_names),
                ).all()
                for other in others:
                    db.session.delete(other)

    liker = User.query.get(session["user_id"])
    owner = Upload.query.filter_by(image_name=image_name).first()

    db.session.add(Like(
        user_id=session["user_id"], image_name=image_name
    ))
    db.session.commit()

    if owner and owner.user_id != session["user_id"] and liker:
        liker_name = liker.username
        owner_id = owner.user_id
        try:
            from routes.push import send_push
            send_push(
                f"@{liker_name} curtiu sua imagem",
                f"@{liker_name} curtiu {image_name}",
                owner_id,
                image_name=image_name,
            )
        except Exception:
            pass

    return jsonify({"liked": True})


def _blocked_ids():
    viewer_id = session.get("user_id")
    if not viewer_id:
        return set()
    rows = db.session.query(Block.user_id, Block.blocked_id).filter(
        (Block.user_id == viewer_id) | (Block.blocked_id == viewer_id)
    ).all()
    return {r.blocked_id if r.user_id == viewer_id else r.user_id for r in rows}


def _ranking_payload(eleicao_only=False):
    query = (
        db.session.query(
            Upload.image_name,
            Upload.post_id,
            Upload.post_type,
            Upload.caption,
            Upload.nsfw,
            Upload.media_type,
            Upload.eleicao,
            Upload.user_id,
            Upload.id,
            Upload.created_at,
            User.username.label("owner"),
            User.display_name.label("owner_display_name"),
            db.func.count(Like.id).label("likes"),
        )
        .outerjoin(User, Upload.user_id == User.id)
        .outerjoin(Like, Like.image_name == Upload.image_name)
        .filter(Upload.active == 1)
    )
    if eleicao_only:
        query = query.filter(Upload.eleicao == 1)
    rows = query.group_by(Upload.id).order_by(db.desc("likes"), db.desc(Upload.created_at), db.desc(Upload.id)).all()

    blocked = _blocked_ids()
    rows = [r for r in rows if not (r.user_id and r.user_id in blocked)]

    post_map = {}
    for r in rows:
        pid = r.post_id or r.image_name
        if r.eleicao:
            pid = r.image_name
        media = {"name": r.image_name, "media_type": r.media_type}
        if pid not in post_map:
            post_map[pid] = {
                "id": r.id,
                "post_id": pid,
                "name": r.image_name,
                "owner": r.owner,
                "owner_display_name": r.owner_display_name or r.owner,
                "likes": r.likes,
                "post_type": r.post_type,
                "caption": r.caption or "",
                "nsfw": bool(r.nsfw),
                "eleicao": bool(r.eleicao),
                "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else r.created_at,
                "media": [media],
            }
        else:
            post_map[pid]["media"].append(media)

    result = list(post_map.values())

    for p in result:
        likers = (
            db.session.query(User.username, User.display_name, Like.user_id)
            .join(User, Like.user_id == User.id)
            .filter(Like.image_name.in_([m["name"] for m in p["media"]]))
            .distinct()
            .all()
        )
        p["likers"] = [{"username": lr.username, "display_name": lr.display_name or lr.username, "id": lr.user_id} for lr in likers]

    img_dir = Config.BASE_DIR / "images"
    result = [
        x for x in result
        if x.get("post_type") == "text" or any((img_dir / m["name"]).exists() for m in x["media"])
    ]
    return result


@likes_bp.route("/api/votos", methods=["GET"])
def ranking_api():
    return jsonify(_ranking_payload())


@likes_bp.route("/api/eleicao", methods=["GET"])
def eleicao_ranking_api():
    return jsonify(_ranking_payload(eleicao_only=True))


@likes_bp.route("/api/eleicao/vencedoras", methods=["GET"])
def eleicao_vencedoras_api():
    from db.models import Winner
    winners = Winner.query.order_by(Winner.number.asc()).all()
    return jsonify([{
        "id": w.id,
        "image_name": w.image_name,
        "caption": w.caption or "",
        "number": w.number,
        "created_at": w.created_at,
    } for w in winners])
