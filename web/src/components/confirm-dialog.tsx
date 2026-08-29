'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Plain text or small JSX describing exactly what is about to happen — GLB-02 requires the
   * dialog to state the action and key record details, not just a generic "are you sure". */
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isConfirming?: boolean;
  destructive?: boolean;
}

/** A single reusable confirmation dialog for every high-impact create/finalize/payment/return/
 * settlement/stock-changing action (GLB-02). Cancel closes with no data change; Confirm calls
 * onConfirm exactly once — the caller is responsible for disabling the trigger while
 * isConfirming is true so a duplicate click cannot double-submit. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  isConfirming,
  destructive,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isConfirming}
            className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            onClick={onConfirm}
          >
            {isConfirming ? 'Please wait…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
