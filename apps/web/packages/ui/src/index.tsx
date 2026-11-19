import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
export { Dialog, Drawer } from "./dialog";

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button className={`ui-button ui-button--${variant} ${className}`} {...props} />;
}
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`} {...props} />;
}
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ui-card ${className}`}>{children}</div>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "error" }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
export function Skeleton({ className = "" }: { className?: string }) { return <span aria-hidden="true" className={`ui-skeleton ${className}`} />; }
export function MessageState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="ui-state" role="status"><h3>{title}</h3><p>{description}</p>{action}</div>;
}
