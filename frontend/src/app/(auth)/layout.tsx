import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}