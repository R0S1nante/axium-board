#!/usr/bin/env python3
"""Export the scene as one portable HTML document for browser/Claude handoff."""
import argparse
import base64
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
assets_dir = root / 'assets' / 'office'

def uri(name):
    return 'data:image/webp;base64,' + base64.b64encode((assets_dir / name).read_bytes()).decode()

assets = {p.stem: uri(p.name) for p in sorted(assets_dir.glob('*.webp')) if p.stem != 'studio-day'}
parts = []
for name in ['locomotion.mjs', 'avatar-rig.mjs', 'studio.mjs']:
    source = (assets_dir / name).read_text()
    source = re.sub(r'^import .*?;\n', '', source, flags=re.M)
    source = re.sub(r'^export ', '', source, flags=re.M)
    parts.append(source)
script = '(function(){\nconst AVATAR_ASSETS=' + json.dumps(assets) + ';\n' + '\n'.join(parts) + '\n})();'
original = 'new AvatarRig(el,`assets/office/${m.id}.webp`,m.robot?null:`assets/office/${m.id}-back.webp`,!!m.robot)'
replacement = 'new AvatarRig(el,AVATAR_ASSETS[m.id],m.robot?null:AVATAR_ASSETS[m.id+"-back"],!!m.robot)'
assert original in script, 'Avatar source changed: update the export substitution.'
script = script.replace(original, replacement)
html = (root / 'studio.html').read_text()
html = html.replace('<link rel="stylesheet" href="assets/office/studio.css">', '<style>\n' + (assets_dir / 'studio.css').read_text() + '\n</style>')
html = html.replace('<link rel="preload" as="image" href="assets/office/studio-day.webp">', '')
html = html.replace('src="assets/office/studio-day.webp"', 'src="' + uri('studio-day.webp') + '"')
html = html.replace('<script type="module" src="assets/office/studio.mjs"></script>', '<script>\n' + script + '\n</script>')
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- Standalone Axium office v2: all images and animation code embedded.\nCanvas 2D articulated walking, curved routes, front/rear views, soft starts/stops.\nAsia/Almaty lighting: darker after 17:00. Optional board tasks: ?k=YOUR_KEY. -->')
assert not re.search(r'(?:src|href)="assets/', html), 'An external asset was left behind.'
assert html.count('data:image/webp;base64,') == 10, 'Expected the room and nine avatar images.'
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(html)
print(args.out.resolve())
