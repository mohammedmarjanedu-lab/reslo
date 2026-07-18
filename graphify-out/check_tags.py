from pathlib import Path

content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\components\PropertiesPanel.svelte').read_text(encoding='utf-8')
lines = content.splitlines()

stack = []
for i, line in enumerate(lines, 1):
    # Find tag start/ends
    pos = 0
    while True:
        pos_open = content.find('<div', pos)
        pos_close = content.find('</div', pos)
        
        # We need to trace them line by line
        # A simpler way is to parse line by line:
        break

    # Let's count open/close in this line
    o = line.count('<div')
    c = line.count('</div')
    for _ in range(o):
        stack.append(i)
    for _ in range(c):
        if stack:
            opened_at = stack.pop()
            # print(f"Closed div from line {opened_at} at line {i}")
        else:
            print(f"ERROR: Extra closing div at line {i}")

print(f"Stack remaining (unclosed divs): {stack}")
