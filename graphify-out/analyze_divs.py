from pathlib import Path

content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\components\PropertiesPanel.svelte').read_text(encoding='utf-8')
lines = content.splitlines()

# Simple tag analyzer
open_divs = []
close_divs = []
if_blocks = []
for i, line in enumerate(lines, 1):
    # Find all divs
    div_opens = line.count('<div')
    div_closes = line.count('</div')
    if div_opens > 0 or div_closes > 0:
         print(f"Line {i}: +{div_opens} / -{div_closes} | {line.strip()[:60]}")
