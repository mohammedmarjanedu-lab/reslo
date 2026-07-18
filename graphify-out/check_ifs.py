from pathlib import Path

content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\components\PropertiesPanel.svelte').read_text(encoding='utf-8')
lines = content.splitlines()

for i, line in enumerate(lines, 1):
    if '{#if' in line or '{:else if' in line or '{/if}' in line:
        print(f"Line {i}: {line.strip()}")
