import { cn } from "@/lib/utils/cn";

interface PageContainerProps {
  /** Optional additional classes */
  className?: string;
  children: React.ReactNode;
  /** Maximum content width preset */
  width?: "default" | "narrow" | "wide";
}

const widthClasses = {
  default: "max-w-4xl",
  narrow: "max-w-2xl",
  wide: "max-w-6xl",
};

/**
 * Responsive centred content container.
 * Provides consistent horizontal padding and max-width for all page content.
 */
export function PageContainer({
  className,
  children,
  width = "default",
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        widthClasses[width],
        className
      )}
    >
      {children}
    </div>
  );
}
