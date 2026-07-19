import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Loading skeleton for authenticated application routes.
 * Displayed while the Server Component is streaming in.
 */
export default function AppLoading() {
  return (
    <div className="py-8">
      <PageContainer width="wide">
        {/* Page header skeleton */}
        <div className="mb-8 space-y-2">
          <div
            className="h-8 w-48 rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--bg-subtle)" }}
          />
          <div
            className="h-4 w-64 rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--bg-subtle)" }}
          />
        </div>

        {/* Card skeletons */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-xl animate-pulse"
              style={{ backgroundColor: "var(--bg-subtle)" }}
            />
          ))}
        </div>
      </PageContainer>
    </div>
  );
}
