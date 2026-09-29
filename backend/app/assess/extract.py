"""Turn uploaded learning material into referenced text sections: [{"ref": "Page 3", "text": ...}]."""

import io
import re

MAX_SECTION_CHARS = 4000
KINDS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
}
EXT_KINDS = {".pdf": "pdf", ".pptx": "pptx", ".docx": "docx", ".txt": "txt", ".md": "txt"}


def kind_for(filename: str, content_type: str) -> str | None:
    if content_type in KINDS:
        return KINDS[content_type]
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    return EXT_KINDS.get(ext)


def _clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()


def _pdf(data: bytes) -> list[dict]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return [{"ref": f"Page {i}", "text": _clean(page.extract_text() or "")} for i, page in enumerate(reader.pages, 1)]


def _pptx(data: bytes) -> list[dict]:
    from pptx import Presentation

    out = []
    for i, slide in enumerate(Presentation(io.BytesIO(data)).slides, 1):
        parts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                parts.append(shape.text_frame.text)
            if getattr(shape, "has_table", False) and shape.has_table:
                parts += [" | ".join(c.text for c in row.cells) for row in shape.table.rows]
        if slide.has_notes_slide:
            parts.append(slide.notes_slide.notes_text_frame.text)
        out.append({"ref": f"Slide {i}", "text": _clean("\n".join(parts))})
    return out


def _docx(data: bytes) -> list[dict]:
    from docx import Document

    out, title, buf = [], "Introduction", []

    def flush():
        if any(t.strip() for t in buf):
            out.append({"ref": f"Section: {title[:60]}", "text": _clean("\n".join(buf))})

    for p in Document(io.BytesIO(data)).paragraphs:
        if p.style is not None and p.style.name.lower().startswith("heading") and p.text.strip():
            flush()
            title, buf = p.text.strip(), []
        else:
            buf.append(p.text)
    flush()
    return out


def _txt(data: bytes) -> list[dict]:
    text = data.decode("utf-8", errors="replace")
    chunks = [c for c in re.split(r"\n\s*\n", text) if c.strip()]
    out, buf = [], ""
    for c in chunks:
        if len(buf) + len(c) > 2500 and buf:
            out.append(buf)
            buf = ""
        buf += c + "\n\n"
    if buf.strip():
        out.append(buf)
    return [{"ref": f"Part {i}", "text": _clean(t)} for i, t in enumerate(out, 1)]


def extract_sections(kind: str, data: bytes) -> list[dict]:
    """Referenced sections with text; empty sections dropped, long ones trimmed."""
    sections = {"pdf": _pdf, "pptx": _pptx, "docx": _docx, "txt": _txt}[kind](data)
    return [{"ref": s["ref"], "text": s["text"][:MAX_SECTION_CHARS]} for s in sections if len(s["text"]) >= 40]
