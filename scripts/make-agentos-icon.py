"""Generate the AgentOS desktop icon (ink #101716 tile with a sage #bdd1aa mark)."""
from pathlib import Path

from PIL import Image, ImageDraw

INK = (16, 23, 22, 255)
SAGE = (189, 209, 170, 255)
OUT = Path(__file__).resolve().parent / "assets" / "agentos.ico"


def render(size: int = 256) -> Image.Image:
    scale = 4  # supersample for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=INK)
    w = int(s * 0.085)
    # "A" chevron with crossbar, plus an orbit dot for the agent.
    top, left, right, base = (s * 0.5, s * 0.24), (s * 0.24, s * 0.76), (s * 0.76, s * 0.76), s * 0.58
    d.line([left, top, right], fill=SAGE, width=w, joint="curve")
    for x, y in (left, top, right):
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=SAGE)
    d.line([(s * 0.355, base), (s * 0.645, base)], fill=SAGE, width=int(w * 0.8))
    r = s * 0.06
    cx, cy = s * 0.76, s * 0.27
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=SAGE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    render().save(OUT, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    render().save(OUT.with_suffix(".png"))  # preview copy
    print(f"icon={OUT}")
