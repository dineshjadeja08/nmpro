"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = { open: boolean; onClose: () => void; title: string; children: ReactNode; placement?: "center" | "side" };

export function Dialog({ open, onClose, title, children, placement = "center" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={`ui-dialog ui-dialog--${placement}`} onClose={onClose} aria-label={title}>
    <div className="ui-dialog__header"><h2>{title}</h2><button type="button" onClick={() => ref.current?.close()} aria-label="Close dialog">×</button></div>
    {children}
  </dialog>;
}

export function Drawer(props: Omit<DialogProps, "placement">) {
  return <Dialog {...props} placement="side" />;
}
