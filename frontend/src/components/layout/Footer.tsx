import { ChefHat } from "lucide-react";

const Footer = () => {
  const links = [
    { label: "고객센터", href: "#" },
    { label: "이용약관", href: "#" },
    { label: "개인정보처리방침", href: "#" },
  ];

  return (
    <footer className="bg-cream-dark border-t border-border">
      <div className="container mx-auto px-4 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              Resiply<span className="text-primary">+</span>
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-xs text-muted-foreground">
            © 2025 Resiply+. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
