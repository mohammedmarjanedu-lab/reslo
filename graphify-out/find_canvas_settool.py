from pathlib import Path
content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\components\WorkspaceCanvas.svelte').read_text(encoding='utf-8')
for i, line in enumerate(content.splitlines(), 1):
    if 'setTool' in line or 'uiState.tool =' in line:
        print(f'{i}: {line}')
