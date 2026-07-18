from pathlib import Path

# Let's mock the ending we propose
ending = """      {/if}
    </div>
  {/if}
</div>

<div class="flex gap-2 pt-2 border-t border-slate-700 shrink-0 mt-1.5">
  <button
    onclick={handleDelete}
    class="flex-1 rounded bg-red-800 py-1.5 text-xs text-red-200 hover:bg-red-700 transition-colors cursor-pointer"
  >Delete</button>
</div>

<!-- Resize handle -->
<div 
  class="absolute right-0 bottom-0 w-3.5 h-3.5 cursor-se-resize flex items-end justify-end p-0.5"
  onmousedown={resizeStart}
>
  <svg class="w-2.5 h-2.5 text-slate-500 hover:text-slate-300" viewBox="0 0 10 10" fill="currentColor">
    <path d="M10 0 L0 10 L10 10 Z" />
  </svg>
</div>
</div>
{/if}"""

content = Path(r'c:\Users\Mohammed Marjan\Downloads\reslo Project\reslo\src\lib\components\PropertiesPanel.svelte').read_text(encoding='utf-8')
lines = content.splitlines()

# Replace the end starting from line 650
new_lines = lines[:649] + ending.splitlines()

stack = []
for i, line in enumerate(new_lines, 1):
    o = line.count('<div')
    c = line.count('</div')
    for _ in range(o):
        stack.append(i)
    for _ in range(c):
        if stack:
            stack.pop()
        else:
            print(f"ERROR: Extra closing div at line {i}: {line.strip()}")

print(f"Stack remaining: {stack}")
