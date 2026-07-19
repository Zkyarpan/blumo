import { BlumoWordmark } from "@/components/shared/BlumoWordmark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <BlumoWordmark size="lg" />
        </div>
        {children}
      </div>
    </div>
  );
}
