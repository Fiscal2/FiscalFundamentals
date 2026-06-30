import Link from 'next/link';

export default function FooterMenu() {
  const links = [
    { href: '/about', label: 'About' },
    { href: '/disclaimer', label: 'Disclaimer' },
    { href: '/terms', label: 'Terms' },
    { href: '/privacy', label: 'Privacy' },
  ];

  return (
    <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
      {links.map(({ href, label }) => (
        <Link key={href} href={href} className="text-sm hover:text-white transition hover:underline">
          {label}
        </Link>
      ))}
    </nav>
  );
}