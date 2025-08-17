import { toast as sonnerToast } from 'sonner';

export function useToast() {
  const toast = ({ title, description, variant = 'default' }: {
    title: string;
    description?: string;
    variant?: 'default' | 'destructive' | 'success';
  }) => {
    switch (variant) {
      case 'destructive':
        return sonnerToast.error(title, { description });
      case 'success':
        return sonnerToast.success(title, { description });
      default:
        return sonnerToast(title, { description });
    }
  };

  return { toast };
} 