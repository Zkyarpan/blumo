import { Metadata } from "next";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Zap, TrendingUp, Info } from "lucide-react";

// TODO (Unit 02): Add route protection. This page is publicly accessible
// only during Unit 01 to validate the UI shell. Authentication will gate
// this route in the next unit.

export const metadata: Metadata = {
  title: "Dashboard — Blumo",
  description: "Your Blumo developer growth dashboard.",
};

export default function DashboardPage() {
  return (
    <div className="py-8">
      <PageContainer width="wide">
        {/* Development notice */}
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3 mb-8 text-sm"
          style={{
            backgroundColor: "var(--state-info-soft)",
            borderColor: "var(--state-info)",
            color: "var(--state-info)",
          }}
          role="status"
        >
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <strong>Placeholder dashboard.</strong> Data integration is not
            implemented yet. Authentication, GitHub connection, and AI missions
            are introduced in upcoming build units.
          </p>
        </div>

        {/* Page header */}
        <div className="mb-8">
          <h1
            className="text-2xl md:text-3xl font-semibold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Dashboard
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Your learning progress and today&apos;s mission.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Today's mission card */}
          <Card
            className="md:col-span-2 rounded-xl border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-default)",
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap
                    size={18}
                    style={{ color: "var(--accent-primary)" }}
                    aria-hidden="true"
                  />
                  <CardTitle
                    className="text-base"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Today&apos;s mission
                  </CardTitle>
                </div>
                <Badge
                  className="text-xs"
                  style={{
                    backgroundColor: "var(--bg-subtle)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  Not started
                </Badge>
              </div>
              <CardDescription style={{ color: "var(--text-muted)" }}>
                Complete onboarding and connect GitHub to generate your first
                mission.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg border-2 border-dashed p-8 text-center"
                style={{ borderColor: "var(--border-default)" }}
              >
                <Zap
                  size={32}
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
                <p
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Sign in and complete onboarding to get started.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* GitHub connection card */}
          <Card
            className="rounded-xl border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-default)",
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <GitBranch
                  size={18}
                  style={{ color: "var(--text-secondary)" }}
                  aria-hidden="true"
                />
                <CardTitle
                  className="text-base"
                  style={{ color: "var(--text-primary)" }}
                >
                  GitHub connection
                </CardTitle>
              </div>
              <CardDescription style={{ color: "var(--text-muted)" }}>
                Connect a repository to enable mission commits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg border-2 border-dashed p-6 text-center"
                style={{ borderColor: "var(--border-default)" }}
              >
                <GitBranch
                  size={28}
                  className="mx-auto mb-2"
                  style={{ color: "var(--border-strong)" }}
                  aria-hidden="true"
                />
                <p
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Not connected
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Progress placeholder */}
          <Card
            className="md:col-span-2 lg:col-span-3 rounded-xl border"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-default)",
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp
                  size={18}
                  style={{ color: "var(--text-secondary)" }}
                  aria-hidden="true"
                />
                <CardTitle
                  className="text-base"
                  style={{ color: "var(--text-primary)" }}
                >
                  Progress
                </CardTitle>
              </div>
              <CardDescription style={{ color: "var(--text-muted)" }}>
                Your completed missions and streak will appear here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg border-2 border-dashed p-6 text-center"
                style={{ borderColor: "var(--border-default)" }}
              >
                <TrendingUp
                  size={28}
                  className="mx-auto mb-2"
                  style={{ color: "var(--border-strong)" }}
                  aria-hidden="true"
                />
                <p
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  No activity yet.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
