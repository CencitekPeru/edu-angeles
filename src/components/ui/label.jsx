import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm leading-none font-medium text-foreground', className)}
      {...props}
    />
  )
}

export { Label }
