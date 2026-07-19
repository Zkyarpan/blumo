"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GitBranch, ExternalLink } from "lucide-react";

interface ConnectGitHubButtonProps {
  installationUrl: string;
}

export function ConnectGitHubButton({
  installationUrl,
}: ConnectGitHubButtonProps) {
  const [loading, setLoading] = useState(false);

  function handleConnect() {
    setLoading(true);
    window.location.href = installationUrl;
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={loading}
      aria-disabled={loading}
      className="gap-2"
    >
      <GitBranch size={16} aria-hidden="true" />
      {loading ? "Redirecting to GitHub…" : "Connect GitHub"}
      {!loading && <ExternalLink size={14} aria-hidden="true" />}
    </Button>
  );
}
