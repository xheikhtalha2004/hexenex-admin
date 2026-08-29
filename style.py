import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Update the table head row
    content = content.replace(
        '<tr className="border-b bg-muted/40 text-xs text-muted-foreground">',
        '<tr className="border-b bg-muted/40 text-xs text-muted-foreground divide-x divide-border/50">'
    )
    
    # 2. Update tbody
    content = content.replace(
        '<tbody>',
        '<tbody className="divide-y divide-border/50">'
    )
    
    # 3. Update table body rows
    content = content.replace(
        '<tr key={row.key} className="border-b last:border-b-0 align-top">',
        '<tr key={row.key} className="divide-x divide-border/50 align-top">'
    )
    content = content.replace(
        '<tr key={row.key} className="border-b last:border-b-0">',
        '<tr key={row.key} className="divide-x divide-border/50">'
    )
    
    # 4. Update td padding to p-0
    content = re.sub(
        r'<td className="p-1( align-top)?"( colSpan=\{[^\}]+\})?>',
        lambda m: f'<td className="p-0{m.group(1) or ""}"{m.group(2) or ""}>',
        content
    )
    
    # Update the text columns (amount / sqft) that don't have inputs
    content = content.replace(
        '<td className="p-1 pt-2.5 align-top text-right font-mono">',
        '<td className="px-2 py-1.5 align-top text-right font-mono">'
    )
    content = content.replace(
        '<td className="p-1 pt-2.5 text-right font-mono">',
        '<td className="px-2 py-1.5 text-right font-mono">'
    )

    # 5. Update inputs to be borderless and fill the cell
    content = re.sub(
        r'<Input\s*className="h-8 text-sm"',
        r'<Input\n                                className="h-8 text-sm rounded-none border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-inset px-2"',
        content
    )
    # 6. Update select triggers to be borderless
    content = content.replace(
        '<SelectTrigger className="h-8 text-sm">',
        '<SelectTrigger className="h-8 text-sm rounded-none border-0 bg-transparent focus:ring-1 focus:ring-inset px-2 shadow-none">'
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process_file('web/src/app/(app)/sales-invoices/page.tsx')
process_file('web/src/app/(app)/quotations/page.tsx')

