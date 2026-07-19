import { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Target, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Blumo — Grow every day.",
  description:
    "Blumo converts your development goal into small daily missions and creates meaningful GitHub progress — with your approval, every time.",
};

const steps = [
  {
    icon: Target,
    step: "01",
    title: "Choose a goal",
    description:
      "Tell Blumo what you want to learn — technology, experience level, and how much time you have.",
  },
  {
    icon: Zap,
    step: "02",
    title: "Complete a daily mission",
    description:
      "Blumo generates a specific, achievable task. You read the instructions, edit the content, and mark it done.",
  },
  {
    icon: CheckCircle2,
    step: "03",
    title: "Approve meaningful GitHub progress",
    description:
      "Review the exact file, path, and commit message. Approve to commit. Your work, your decision, every time.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 md:py-32">
        <PageContainer width="narrow" className="text-center">
          <Badge
            className="mb-6 font-medium"
            style={{
              backgroundColor: "var(--accent-soft)",
              color: "var(--accent-strong)",
              border: "1px solid var(--border-default)",
            }}
          >
            Private beta coming soon
          </Badge>

          <h1
            className="text-4xl md:text-6xl font-semibold tracking-tight leading-tight mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            Grow every day.
          </h1>

          <p
            className="text-base md:text-lg mb-10 max-w-xl mx-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Blumo turns your development goal into small, achievable daily
            missions — and creates meaningful GitHub progress with your approval,
            every time.
          </p>

          <Button
            size="lg"
            disabled
            className="rounded-lg cursor-not-allowed opacity-70"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "var(--text-inverse)",
            }}
            aria-disabled="true"
            title="Authentication is coming in a future release"
          >
            Start growing
          </Button>
          <p
            className="mt-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            GitHub sign-in coming soon.
          </p>
        </PageContainer>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="py-20"
        style={{ backgroundColor: "var(--bg-subtle)" }}
      >
        <PageContainer>
          <h2
            className="text-xl font-semibold mb-2 text-center"
            style={{ color: "var(--text-primary)" }}
          >
            How it works
          </h2>
          <p
            className="text-sm text-center mb-12"
            style={{ color: "var(--text-muted)" }}
          >
            Three steps to consistent developer growth.
          </p>

          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map(({ icon: Icon, step, title, description }) => (
              <Card
                key={step}
                className="rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-default)",
                }}
              >
                <CardContent className="pt-6 pb-6">
                  <div
                    className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4"
                    style={{ backgroundColor: "var(--accent-soft)" }}
                  >
                    <Icon
                      size={20}
                      style={{ color: "var(--accent-primary)" }}
                      aria-hidden="true"
                    />
                  </div>
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Step {step}
                  </p>
                  <h3
                    className="text-base font-semibold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </PageContainer>
      </section>

      {/* Product principle */}
      <section className="py-20">
        <PageContainer width="narrow" className="text-center">
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Blumo is about{" "}
            <span style={{ color: "var(--accent-primary)" }}>
              meaningful progress
            </span>
            , not fake commits. Every contribution reflects real work you did
            and reviewed.{" "}
            <Link
              href="#how-it-works"
              className="underline underline-offset-2 hover:no-underline"
              style={{ color: "var(--text-secondary)" }}
            >
              See how it works.
            </Link>
          </p>
        </PageContainer>
      </section>
    </>
  );
}
