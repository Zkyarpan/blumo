import { cn } from "@/lib/utils/cn";

interface BlumoWordmarkProps {
  /** Visual size variant */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-lg font-semibold",
  md: "text-xl font-semibold",
  lg: "text-2xl font-bold",
};

/**
 * The Blumo brand wordmark. Renders the product name with brand styling.
 * Used in headers and wherever the brand identity needs to appear.
 */
export function BlumoWordmark({ size = "md", className }: BlumoWordmarkProps) {
  return (
    <span
      className={cn(
        "tracking-tight select-none",
        sizeClasses[size],
        className
      )}
      style={{ color: "var(--accent-primary)" }}
    >
      Blumo
    </span>
  );
}
