'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface-raised group-[.toaster]:text-text group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-text-muted',
          actionButton: 'group-[.toast]:bg-brand group-[.toast]:text-text-on-brand',
          cancelButton: 'group-[.toast]:bg-surface group-[.toast]:text-text',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
