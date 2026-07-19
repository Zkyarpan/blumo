"use client";

import { GitHubIcon } from "@/components/shared/GitHubIcon";

interface ConnectGitHubButtonProps {
  installationUrl: string;
}

/**
 * Client component that navigates the browser to the GitHub App installation
 * page. Uses window.location.href so the full page is replaced, allowing
 * GitHub to redirect back to the setup callback after install.
 */
export function ConnectGitHubButton({ installationUrl }: ConnectGitHubButtonProps) {
  function handleClick() {
    window.location.href = installationUrl;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors w-full"
      style={{
        backgroundColor: "var(--text-primary)",
        color: "var(--bg-surface)",
      }}
    >
      <GitHubIcon className="size-4" />
      Connect GitHub
    </button>
  );
}
