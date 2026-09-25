import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Load Tester | High-Scale Distributed API & Load Testing Platform',
  description: 'Enterprise-grade functional API testing, distributed million-scale load generation, real-time dashboards, and CI/CD automation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080c14] text-slate-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
