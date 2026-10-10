"""Assembles the frames from capture-assets.mjs into docs/demo.gif (needs Pillow)."""
import json
from pathlib import Path

from PIL import Image

frames_dir = Path('test-results/demo-frames')
durations = json.loads((frames_dir / 'durations.json').read_text())
paths = sorted(frames_dir.glob('*.png'))
# One palette built from frames across the whole clip keeps colors steady and true.
images = [Image.open(path).convert('RGB') for path in paths]
samples = images[:: max(1, len(images) // 8)]
width, height = samples[0].size
sheet = Image.new('RGB', (width, height * len(samples)))
for row, image in enumerate(samples):
    sheet.paste(image, (0, row * height))
palette = sheet.quantize(colors=200, method=Image.Quantize.MEDIANCUT)
frames = [image.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG) for image in images]
Path('docs').mkdir(exist_ok=True)
frames[0].save('docs/demo.gif', save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(f"docs/demo.gif: {len(frames)} frames, {Path('docs/demo.gif').stat().st_size / 1e6:.1f} MB")
