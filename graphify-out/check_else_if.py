from pathlib import Path

content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\components\PropertiesPanel.svelte').read_text(encoding='utf-8')
lines = content.splitlines()

# We only check from line 154 to line 650
stack = []
for i in range(153, 650):
    line = lines[i]
    o = line.count('<div')
    c = line.count('</div')
    for _ in range(o):
        stack.append(i + 1)
    for _ in range(c):
        if stack:
            stack.pop()
        else:
            print(f"ERROR: Extra closing div at line {i + 1}: {line.strip()}")

print(f"Unclosed divs inside else-if: {stack}")
