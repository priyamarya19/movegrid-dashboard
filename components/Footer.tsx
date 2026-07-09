export default function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-xs text-faint ${className}`}>
      Developed with <span className="text-accent-danger-alt-text">❤</span> · © {new Date().getFullYear()} MoveGrid Technologies Pvt Ltd
    </footer>
  );
}
