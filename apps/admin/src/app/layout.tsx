import type { ReactNode } from "react";
import "./style.css";
export const metadata = { title: "NammaPros Admin", description: "Staff administration console", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
