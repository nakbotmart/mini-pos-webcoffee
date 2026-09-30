import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Mini POS',
  description: 'ระบบ Mini POS ด้วย Next.js และ Supabase',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <nav className="navbar">
          <div className="navbar-inner">
            <span className="brand">Mini POS</span>
            <div className="nav-links">
              <Link href="/">สินค้า</Link>
              <Link href="/sell">ขายสินค้า</Link>
              <Link href="/history">ประวัติการขาย</Link>
            </div>
          </div>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
