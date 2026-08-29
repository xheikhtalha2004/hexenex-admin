import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import { cn } from '@/lib/utils';

export function SearchableSelect({ value, onValueChange, items, placeholder = "Select...", triggerClassName = "" }) {
  const [search, setSearch] = useState('');
  
  const searchLower = search.toLowerCase();
  const filtered = items
    .filter(i => i.label.toLowerCase().includes(searchLower))
    .sort((a, b) => {
      const aLower = a.label.toLowerCase();
      const bLower = b.label.toLowerCase();
      const aStarts = aLower.startsWith(searchLower);
      const bStarts = bLower.startsWith(searchLower);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aLower.localeCompare(bLower);
    });

  const selectedLabel = items.find((i) => i.value === value)?.label;
  
  return (
    <Select 
      value={value || null} 
      onValueChange={(v) => {
        onValueChange(v);
      }}
      onOpenChange={(isOpen) => {
        if (!isOpen) setSearch('');
      }}
    >
      <SelectTrigger className={cn(!value ? "text-muted-foreground" : "", triggerClassName)}>
        <span className="flex flex-1 text-left truncate">
          {selectedLabel || placeholder}
        </span>
      </SelectTrigger>
      <SelectContent>
        <div className="p-2 border-b sticky top-0 bg-popover z-10" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Input 
            placeholder="Search..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            autoFocus
          />
        </div>
        {filtered.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground text-center">No results</div>
        ) : (
          filtered.map(item => (
            <SelectItem 
              key={item.value} 
              value={item.value}
            >
              {item.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
