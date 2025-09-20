import { PublicLayout } from '@/components/layout/PublicLayout';

export default function PublicLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicLayout>{children}</PublicLayout>;
}