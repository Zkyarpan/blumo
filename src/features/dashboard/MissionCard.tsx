import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import Link from "next/link";

/**
 * Today's mission card — always renders the empty state in Unit 05.
 * Task generation is introduced in a later unit.
 */
export function MissionCard() {
  return (
    <Card
      className="rounded-xl border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Zap
            size={18}
            style={{ color: "var(--accent-primary)" }}
            aria-hidden="true"
          />
          <CardTitle
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Today&apos;s mission
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="rounded-lg border-2 border-dashed p-10 text-center"
          style={{ borderColor: "var(--border-default)" }}
        >
          <Zap
            size={40}
            className="mx-auto mb-3"
            style={{ color: "var(--border-strong)" }}
            aria-hidden="true"
          />
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            No mission yet
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            <Link
              href="/settings"
              className="underline underline-offset-2 transition-colors hover:opacity-80"
              style={{ color: "var(--accent-primary)" }}
            >
              Connect a GitHub repository
            </Link>{" "}
            and generate your first mission.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
