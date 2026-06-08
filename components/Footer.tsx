export default function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-xs text-gray-600 ${className}`}>
      Developed with <span className="text-red-500">❤</span> · © {new Date().getFullYear()} MoveGrid Technologies Pvt Ltd
    </footer>
  );
}
