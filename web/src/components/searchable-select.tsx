'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SearchableSelectItem {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value?: string | null;
  onValueChange: (value: string) => void;
  items: readonly SearchableSelectItem[];
  placeholder?: string;
  triggerClassName?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  items,
  placeholder = 'Select...',
  triggerClassName = '',
}: SearchableSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return Array.from(items)
      .filter((item) => item.label.toLocaleLowerCase().includes(normalizedSearch))
      .sort((a, b) => {
        const aLabel = a.label.toLocaleLowerCase();
        const bLabel = b.label.toLocaleLowerCase();
        const aStartsWithSearch = aLabel.startsWith(normalizedSearch);
        const bStartsWithSearch = bLabel.startsWith(normalizedSearch);

        if (aStartsWithSearch !== bStartsWithSearch) return aStartsWithSearch ? -1 : 1;
        return aLabel.localeCompare(bLabel);
      });
  }, [items, search]);

  const selectedLabel = items.find((item) => item.value === value)?.label;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setSearch('');
  }

  function selectItem(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
    setSearch('');
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          !selectedLabel && 'text-muted-foreground',
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) min-w-56 gap-0 overflow-hidden p-0"
      >
        <div className="border-b p-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search..."
            aria-label={'Search ' + placeholder.toLocaleLowerCase()}
            autoFocus
          />
        </div>
        <div role="listbox" className="max-h-64 overflow-y-auto p-1">
          {filteredItems.length === 0 ? (
            <div className="p-2 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                onClick={() => selectItem(item.value)}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.value === value && <Check className="size-4 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
