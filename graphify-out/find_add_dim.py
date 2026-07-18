from pathlib import Path
content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\stores\structuralModel.svelte.ts').read_text(encoding='utf-8')
for i, line in enumerate(content.splitlines(), 1):
    if 'addDimension' in line or 'dimensions' in line:
        print(f'{i}: {line}')
