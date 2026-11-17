import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ProofTrail | Tamper-Evident Disbursement Ledger',
  description: 'Cryptographically verifiable public welfare disbursements using PostgreSQL hash-chained ledger',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
