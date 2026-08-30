'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEventHandler } from 'react';
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
  triggerId?: string;
  openOnFocus?: boolean;
  onTriggerKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}

export function SearchableSelect({
  value,
  onValueChange,
  items,
  placeholder = 'Select...',
  triggerClassName = '',
  triggerId,
  openOnFocus = false,
  onTriggerKeyDown,
}: SearchableSelectProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ignoreNextFocusOpen = useRef(false);
  const optionElements = useRef<Record<string, HTMLButtonElement | null>>({});

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

  useEffect(() => {
    const activeItem = filteredItems[activeIndex];
    if (activeItem) optionElements.current[activeItem.value]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filteredItems]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      const selectedIndex = filteredItems.findIndex((item) => item.value === value);
      setActiveIndex(selectedIndex);
    } else {
      setSearch('');
      setActiveIndex(-1);
    }
  }

  function selectItem(nextValue: string) {
    ignoreNextFocusOpen.current = true;
    onValueChange(nextValue);
    setOpen(false);
    setSearch('');
    requestAnimationFrame(() => {
      ignoreNextFocusOpen.current = false;
    });
  }

  function moveActive(direction: 1 | -1) {
    if (filteredItems.length === 0) return;
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : filteredItems.length - 1;
      return (current + direction + filteredItems.length) % filteredItems.length;
    });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectItem(filteredItems[activeIndex].value);
    } else if (event.key === 'Enter' && filteredItems.length > 0) {
      event.preventDefault();
      selectItem(filteredItems[0].value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        id={triggerId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
        onFocus={() => {
          if (openOnFocus && !ignoreNextFocusOpen.current) {
            setOpen(true);
            const selectedIndex = filteredItems.findIndex((item) => item.value === value);
            setActiveIndex(selectedIndex);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(event.key === 'ArrowDown' ? 0 : Math.max(0, filteredItems.length - 1));
          }
          onTriggerKeyDown?.(event);
        }}
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
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(-1);
            }}
            placeholder="Search..."
            aria-label={'Search ' + placeholder.toLocaleLowerCase()}
            aria-activedescendant={activeIndex >= 0 ? `searchable-select-option-${filteredItems[activeIndex].value}` : undefined}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />
        </div>
        <div role="listbox" className="max-h-64 overflow-y-auto p-1">
          {filteredItems.length === 0 ? (
            <div className="p-2 text-center text-sm text-muted-foreground">No results</div>
          ) : (
            filteredItems.map((item) => (
              <button
                id={`searchable-select-option-${item.value}`}
                ref={(element) => {
                  optionElements.current[item.value] = element;
                }}
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
                  filteredItems[activeIndex]?.value === item.value && 'bg-accent text-accent-foreground',
                )}
                onMouseEnter={() => setActiveIndex(filteredItems.findIndex((candidate) => candidate.value === item.value))}
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
