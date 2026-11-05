import { CheckCircle2, Circle, Clock, Info, MinusCircle, XCircle } from 'lucide-react'

/**
 * Formal, muted status palette shared by the whole admin panel.
 * Colors only appear where they carry meaning (state of a record).
 */
export const TONE = {
  ok: { chip: 'border-[#c9dccf] bg-[#f1f7f3] text-[#2f6447] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300', color: '#3f7d5c', icon: CheckCircle2 },
  warn: { chip: 'border-[#ead9b8] bg-[#fbf6ec] text-[#8a5a12] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300', color: '#b7832f', icon: Clock },
  bad: { chip: 'border-[#e8c4c1] bg-[#fbf1f0] text-[#9a2f2a] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300', color: '#b4413c', icon: XCircle },
  neutral: { chip: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300', color: '#94a3b8', icon: MinusCircle },
  brand: { chip: 'border-[#cfd8ea] bg-[#f2f5fb] text-[#1e3a8a] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300', color: '#1e3a8a', icon: Info },
  plain: { chip: 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200', color: '#64748b', icon: Circle },
}

/** Classes shared by every status pill in tables and cards. */
export const CHIP_BASE = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0'
