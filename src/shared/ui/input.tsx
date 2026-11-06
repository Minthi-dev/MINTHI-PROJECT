import * as LabelPrimitive from '@radix-ui/react-label'
import * as React from 'react'
import { cn } from '@/shared/lib/cn'

const fieldBase =
  'w-full rounded-lg border border-input bg-surface px-3 text-foreground shadow-sm placeholder:text-muted-foreground/70 transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:ring-danger/20'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />,
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldBase, 'min-h-20 py-2', className)} {...props} />,
)
Textarea.displayName = 'Textarea'

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none text-foreground', className)} {...props} />
))
Label.displayName = 'Label'

interface FieldProps {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
  optional?: boolean
}

/** Etichetta + controllo + suggerimento/errore, sempre con la stessa spaziatura. */
export function Field({ label, hint, error, htmlFor, className, children, optional }: FieldProps) {
  // collega automaticamente etichetta e controllo (accessibilità) se manca htmlFor
  const autoId = React.useId()
  let id = htmlFor
  let control = children
  if (!id && React.isValidElement<{ id?: string }>(children) && typeof children.type !== 'string' || (!id && React.isValidElement<{ id?: string }>(children) && ['input', 'textarea', 'select'].includes(children.type as string))) {
    const el = children as React.ReactElement<{ id?: string }>
    id = el.props.id ?? autoId
    control = React.cloneElement(el, { id })
  }
  return (
    <div className={cn('grid gap-1.5', className)}>
      {label && (
        <Label htmlFor={id} className="flex items-center gap-1.5">
          {label}
          {optional && <span className="text-xs font-normal text-muted-foreground">(facoltativo)</span>}
        </Label>
      )}
      {control}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Input con prefisso/suffisso (es. €, min). */
export const AffixInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string }>(
  ({ prefix, suffix, className, ...props }, ref) => (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{prefix}</span>}
      <Input ref={ref} className={cn(prefix && 'pl-7', suffix && 'pr-12', 'tabular', className)} {...props} />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffix}</span>}
    </div>
  ),
)
AffixInput.displayName = 'AffixInput'
