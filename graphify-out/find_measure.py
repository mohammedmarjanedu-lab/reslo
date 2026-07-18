from pathlib import Path
content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\components\WorkspaceCanvas.svelte').read_text(encoding='utf-8')
for i, line in enumerate(content.splitlines(), 1):
    if 'measure' in line or 'tool ===' in line or 'mode ===' in line:
        print(f'{i}: {line}')
