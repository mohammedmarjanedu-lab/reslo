from pathlib import Path
content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\canvas\renderer.ts').read_text(encoding='utf-8')
for i, line in enumerate(content.splitlines(), 1):
    if 'drawDimension' in line or 'drawMeasure' in line or 'dimensions' in line:
        print(f'{i}: {line}')
