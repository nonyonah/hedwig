import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Albus API',
  description: 'Albus API',
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