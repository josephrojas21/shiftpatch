import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/features/shared/workspace';
export const metadata: Metadata = {
  title: 'ShiftPatch — Care starts with coverage',
  description: 'A connected workspace for nurses, staffing agencies and care teams.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
