import Link from 'next/link';

export default function FooterMenu() {
  const links = [
    { href: '/about', label: 'About' },
    { href: '/', label: 'Contact' },
    { href: '/privacy', label: 'Privacy & Terms' },
    { href: '/cookies', label: 'Cookie Settings' },

  ];

  return (
    <nav className="flex space-x-6">
      {links.map(({ href, label }) => (
        <Link key={href} href={href} className="text-sm hover:text-white transition hover:underline">
          {label}
        </Link>
      ))}
    </nav>
  );
}