// src/app/components/layout/footer.tsx
import FooterMenu from './footer-menu';


export default function Footer() {
  return (
    <footer className="w-full border-t border-gray-700 mt-16 text-gray-400">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row justify-between items-center space-y-6 md:space-y-0">
        <FooterMenu />
        <div className="text-center md:text-left">
          <p className="text-sm">&copy; {new Date().getFullYear()} Castling Financial.</p>
        </div>
      </div>
    </footer>
  );
}
