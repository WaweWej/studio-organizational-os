import type { Metadata } from 'next';
import './globals.css';
import './studio.css';
import './client-focus.css';


export const metadata: Metadata = {
  title: 'Studio — Your organizational workspace',
  description: 'Daily work, projects, client context, and review in one considered workspace.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}

