"""REST API веб-кабинета (FastAPI). Все эндпоинты, кроме /login и /health, — за авторизацией."""
from __future__ import annotations

import asyncio
import logging
import os
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core import analytics, items as items_svc
from app.core.ai.llm import LLMClient
from app.core.config import config
from app.core.database import db_session, init_db
from app.core.models import Attachment, Item, Settings, Tag
from app.core.planner import build_day_plan

from .auth import (
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    check_credentials,
    ensure_web_user,
    make_session_token,
    require_auth,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Личный ассистент задач", docs_url=None, redoc_url=None)

_llm: LLMClient | None = None


def get_llm() -> LLMClient:
    global _llm
    if _llm is None:
        _llm = LLMClient()
    return _llm


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    ensure_web_user()


# ============================ Служебное ============================

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ============================ Auth ============================

class LoginBody(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(body: LoginBody, request: Request, response: Response):
    if not check_credentials(body.username, body.password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    secure = request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        SESSION_COOKIE,
        make_session_token(body.username),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=secure,
    )
    return {"ok": True, "username": body.username}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.get("/api/auth/me")
def me(username: str = Depends(require_auth)):
    return {"username": username}


# ============================ Items ============================

class ItemBody(BaseModel):
    type: str | None = None
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    deadline: str | None = None
    delegated_to: str | None = None
    note_date: str | None = None
    note_recurrence: str | None = None
    project_id: int | None = None
    tags: list[str] | None = None


@app.get("/api/items")
def list_items(
    type: str | None = None,
    status: str | None = None,
    tag: str | None = None,
    project_id: int | None = None,
    text: str | None = None,
    include_deleted: bool = False,
    _: str = Depends(require_auth),
):
    with db_session() as s:
        found = items_svc.find_items(
            s,
            types=[type] if type else None,
            status=status,
            tag=tag,
            project_id=project_id,
            text=text,
            include_deleted=include_deleted,
            limit=500,
        )
        return [items_svc.item_to_dict(i) for i in found]


@app.post("/api/items")
def create_item(body: ItemBody, _: str = Depends(require_auth)):
    if body.type not in ("task", "idea", "note", "project"):
        raise HTTPException(status_code=400, detail="Некорректный тип")
    with db_session() as s:
        item = items_svc.create_item(s, body.model_dump(), actor="user")
        return items_svc.item_to_dict(item, with_links=True, session=s)


def _get_item(s, item_id: int) -> Item:
    item = s.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return item


@app.get("/api/items/{item_id}")
def get_item(item_id: int, _: str = Depends(require_auth)):
    with db_session() as s:
        return items_svc.item_to_dict(_get_item(s, item_id), with_links=True, session=s)


@app.patch("/api/items/{item_id}")
def update_item(item_id: int, body: ItemBody, _: str = Depends(require_auth)):
    fields = body.model_dump(exclude_unset=True)
    fields.pop("type", None)
    with db_session() as s:
        item = items_svc.update_item(s, _get_item(s, item_id), fields, actor="user")
        return items_svc.item_to_dict(item, with_links=True, session=s)


@app.delete("/api/items/{item_id}")
def delete_item(item_id: int, _: str = Depends(require_auth)):
    with db_session() as s:
        items_svc.soft_delete(s, _get_item(s, item_id), actor="user")
    return {"ok": True}


@app.post("/api/items/{item_id}/restore")
def restore_item(item_id: int, _: str = Depends(require_auth)):
    with db_session() as s:
        items_svc.restore(s, _get_item(s, item_id), actor="user")
    return {"ok": True}


class StatusBody(BaseModel):
    status: str
    delegated_to: str | None = None


@app.post("/api/items/{item_id}/status")
def set_status(item_id: int, body: StatusBody, _: str = Depends(require_auth)):
    with db_session() as s:
        item = items_svc.set_status(
            s, _get_item(s, item_id), body.status, body.delegated_to, actor="user"
        )
        return items_svc.item_to_dict(item)


class CommentBody(BaseModel):
    text: str


@app.post("/api/items/{item_id}/comments")
def add_comment(item_id: int, body: CommentBody, _: str = Depends(require_auth)):
    with db_session() as s:
        item = _get_item(s, item_id)
        comment = items_svc.add_comment(s, item, body.text, actor="user")
        return {"id": comment.id, "text": comment.text, "created_at": comment.created_at.isoformat()}


# ---------- Вложения (FR-8) ----------

@app.post("/api/items/{item_id}/attachments")
async def upload_attachment(item_id: int, file: UploadFile, _: str = Depends(require_auth)):
    content_type = file.content_type or ""
    if content_type.startswith("image/"):
        kind = "image"
    elif content_type.startswith("audio/"):
        kind = "audio"
    else:
        raise HTTPException(status_code=400, detail="Поддерживаются изображения и аудио")
    ext = os.path.splitext(file.filename or "")[1] or (".jpg" if kind == "image" else ".ogg")
    os.makedirs(config.files_dir, exist_ok=True)
    path = os.path.join(config.files_dir, f"{uuid.uuid4().hex}{ext}")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 20 МБ)")
    with open(path, "wb") as f:
        f.write(data)
    with db_session() as s:
        item = _get_item(s, item_id)
        att = items_svc.add_attachment(s, item, kind, None, file_path=path, actor="user")
        return {"id": att.id, "kind": kind}


@app.get("/api/attachments/{att_id}/file")
def get_attachment_file(att_id: int, _: str = Depends(require_auth)):
    with db_session() as s:
        att = s.get(Attachment, att_id)
        if att is None or not att.file_path or not os.path.exists(att.file_path):
            raise HTTPException(status_code=404, detail="Файл не найден")
        return FileResponse(att.file_path)


# ---------- Связи (FR-16, FR-27) ----------

class LinkBody(BaseModel):
    other_id: int


@app.post("/api/items/{item_id}/links")
def add_link(item_id: int, body: LinkBody, _: str = Depends(require_auth)):
    with db_session() as s:
        _get_item(s, item_id)
        _get_item(s, body.other_id)
        items_svc.link_items(s, item_id, body.other_id, actor="user")
    return {"ok": True}


@app.delete("/api/items/{item_id}/links/{other_id}")
def remove_link(item_id: int, other_id: int, _: str = Depends(require_auth)):
    with db_session() as s:
        items_svc.unlink_items(s, item_id, other_id, actor="user")
    return {"ok": True}


# ============================ Tags ============================

@app.get("/api/tags")
def list_tags(_: str = Depends(require_auth)):
    with db_session() as s:
        return [
            {"id": t.id, "name": t.name, "is_preset": t.is_preset}
            for t in s.execute(select(Tag).order_by(Tag.name)).scalars()
        ]


class TagBody(BaseModel):
    name: str


@app.post("/api/tags")
def create_tag(body: TagBody, _: str = Depends(require_auth)):
    name = body.name.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Пустое имя")
    with db_session() as s:
        tag = items_svc.get_or_create_tag(s, name)
        return {"id": tag.id, "name": tag.name, "is_preset": tag.is_preset}


# ============================ Settings (FR-28) ============================

class SettingsBody(BaseModel):
    timezone: str | None = None
    morning_report_enabled: bool | None = None
    morning_report_time: str | None = None


@app.get("/api/settings")
def get_settings(_: str = Depends(require_auth)):
    with db_session() as s:
        st = s.get(Settings, 1)
        return {
            "timezone": st.timezone,
            "morning_report_enabled": st.morning_report_enabled,
            "morning_report_time": st.morning_report_time,
        }


@app.patch("/api/settings")
def update_settings(body: SettingsBody, _: str = Depends(require_auth)):
    with db_session() as s:
        st = s.get(Settings, 1)
        if body.timezone is not None:
            from zoneinfo import ZoneInfo

            try:
                ZoneInfo(body.timezone)
            except Exception:
                raise HTTPException(status_code=400, detail="Неизвестный часовой пояс")
            st.timezone = body.timezone
        if body.morning_report_enabled is not None:
            st.morning_report_enabled = body.morning_report_enabled
        if body.morning_report_time is not None:
            st.morning_report_time = body.morning_report_time
        return {
            "timezone": st.timezone,
            "morning_report_enabled": st.morning_report_enabled,
            "morning_report_time": st.morning_report_time,
        }


# ============================ Dashboard (FR-26) ============================

@app.get("/api/dashboard")
def dashboard(_: str = Depends(require_auth)):
    with db_session() as s:
        stats = analytics.dashboard_stats(s)
        stats["plan"] = build_day_plan(s)
        return stats


@app.post("/api/dashboard/insights")
async def insights(_: str = Depends(require_auth)):
    """ИИ-инсайты по агрегатам (вычисляемые, не хранятся — БТ §5)."""
    with db_session() as s:
        stats = analytics.dashboard_stats(s)
    try:
        text = await asyncio.to_thread(get_llm().dashboard_insights, stats)
    except Exception:
        logger.exception("LLM недоступен для инсайтов")
        raise HTTPException(status_code=502, detail="ИИ-провайдер недоступен, попробуйте позже")
    return {"insights": text}
