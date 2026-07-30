import "server-only";

import { serverEnv } from "@/lib/env/server";

// --------------------------------------------------------------------------
// Safe absolute application URL builder
// --------------------------------------------------------------------------

function appUrl(path: string): string {
  const base =
    serverEnv.NEXT_PUBLIC_SITE_URL ??
    serverEnv.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  // Strip trailing slash, ensure path starts with /
  const cleanBase = base.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

// --------------------------------------------------------------------------
// Shared layout wrapper
// --------------------------------------------------------------------------

function layout(title: string, bodyHtml: string, replyTo?: string): string {
  const supportLine = replyTo
    ? `<p style="margin:0 0 8px">Questions? Reply to this email or contact us at <a href="mailto:${replyTo}" style="color:#2E9D5B">${replyTo}</a>.</p>`
    : `<p style="margin:0 0 8px">Questions? Visit <a href="${appUrl("/dashboard")}" style="color:#2E9D5B">your Blumo dashboard</a>.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    body { margin:0; padding:0; background:#F7FAF8; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#132018; }
    .wrap { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; border:1px solid #D9E5DC; overflow:hidden; }
    .header { background:#fff; border-bottom:1px solid #D9E5DC; padding:20px 32px; }
    .wordmark { font-size:20px; font-weight:700; color:#2E9D5B; letter-spacing:-0.5px; text-decoration:none; }
    .body { padding:32px; }
    h1 { margin:0 0 16px; font-size:22px; font-weight:700; color:#132018; }
    p { margin:0 0 16px; font-size:15px; line-height:1.6; color:#3F5A49; }
    .btn { display:inline-block; background:#2E9D5B; color:#fff !important; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600; font-size:15px; margin:8px 0 16px; }
    .meta { font-size:13px; color:#6B7D71; font-family:monospace; }
    .notice { background:#EEF6F0; border:1px solid #D9E5DC; border-radius:8px; padding:12px 16px; margin:16px 0; font-size:13px; color:#3F5A49; }
    .footer { border-top:1px solid #D9E5DC; padding:20px 32px; }
    .footer p { font-size:13px; color:#6B7D71; margin:0 0 6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <a href="${appUrl("/")}" class="wordmark">Blumo</a>
    </div>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="footer">
      ${supportLine}
      <p>You received this email because you have a Blumo account. <a href="${appUrl("/settings")}" style="color:#2E9D5B">Manage notification preferences →</a></p>
    </div>
  </div>
</body>
</html>`;
}

function textLayout(title: string, body: string): string {
  return `${title}\n${"=".repeat(title.length)}\n\n${body}\n\n---\nBlumo — Grow every day.\n${appUrl("/dashboard")}`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --------------------------------------------------------------------------
// 1. Welcome
// --------------------------------------------------------------------------

export function welcomeTemplate(data: {
  recipientName: string;
  goal: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Welcome to Blumo — your first mission awaits";
  const name = escHtml(data.recipientName);
  const goal = escHtml(data.goal);

  const html = layout(
    subject,
    `<h1>Welcome to Blumo, ${name}!</h1>
    <p>You've set your goal: <strong>${goal}</strong>. That's the first step.</p>
    <p>Blumo will help you grow every day through small, meaningful missions committed directly to GitHub.</p>
    <p>Your next step is to connect a GitHub repository so Blumo knows where to commit your work.</p>
    <a href="${appUrl("/github/connect")}" class="btn">Connect GitHub →</a>
    <div class="notice">Every commit is reviewed and approved by you before it's created. Blumo never writes to your repository without your confirmation.</div>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Welcome to Blumo, ${data.recipientName}!\n\nYou've set your goal: ${data.goal}\n\nYour next step: connect a GitHub repository.\n${appUrl("/github/connect")}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 2. Mission generated
// --------------------------------------------------------------------------

export function missionGeneratedTemplate(data: {
  recipientName: string;
  missionTitle: string;
  taskId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = `Your mission is ready: ${data.missionTitle}`;
  const name = escHtml(data.recipientName);
  const title = escHtml(data.missionTitle);
  const reviewUrl = appUrl(`/tasks/${data.taskId}/review`);

  const html = layout(
    subject,
    `<h1>Today's mission is ready</h1>
    <p>Hi ${name}, your AI-generated mission has been created.</p>
    <p class="meta">${title}</p>
    <p>Review the mission, then approve or request a new one. Once approved, you can commit it to your GitHub repository.</p>
    <a href="${reviewUrl}" class="btn">Review mission →</a>
    <div class="notice">This content is AI-generated and requires your review before any commit is made.</div>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Your mission is ready: ${data.missionTitle}\n\nReview it here:\n${reviewUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 3. Mission approved
// --------------------------------------------------------------------------

export function missionApprovedTemplate(data: {
  recipientName: string;
  missionTitle: string;
  taskId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Mission approved — ready to commit";
  const name = escHtml(data.recipientName);
  const title = escHtml(data.missionTitle);
  const commitUrl = appUrl(`/tasks/${data.taskId}/commit`);

  const html = layout(
    subject,
    `<h1>Mission approved</h1>
    <p>Hi ${name}, you've approved your mission:</p>
    <p class="meta">${title}</p>
    <p>Your mission is ready to be committed to GitHub. When you're ready, confirm the commit to create your contribution.</p>
    <a href="${commitUrl}" class="btn">Confirm commit →</a>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Mission approved: ${data.missionTitle}\n\nConfirm your commit here:\n${commitUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 4. Mission rejected
// --------------------------------------------------------------------------

export function missionRejectedTemplate(data: {
  recipientName: string;
  missionTitle: string;
  taskId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Mission rejected — generate a new one when ready";
  const name = escHtml(data.recipientName);
  const title = escHtml(data.missionTitle);
  const reviewUrl = appUrl(`/tasks/${data.taskId}/review`);

  const html = layout(
    subject,
    `<h1>Mission rejected</h1>
    <p>Hi ${name}, you rejected the mission:</p>
    <p class="meta">${title}</p>
    <p>That's fine — you can request a replacement mission from the review page, or generate a new one tomorrow.</p>
    <a href="${reviewUrl}" class="btn">View mission →</a>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Mission rejected: ${data.missionTitle}\n\nGenerate a replacement:\n${reviewUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 5. Mission regenerated
// --------------------------------------------------------------------------

export function missionRegeneratedTemplate(data: {
  recipientName: string;
  missionTitle: string;
  taskId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "New mission ready for review";
  const name = escHtml(data.recipientName);
  const title = escHtml(data.missionTitle);
  const reviewUrl = appUrl(`/tasks/${data.taskId}/review`);

  const html = layout(
    subject,
    `<h1>New mission ready</h1>
    <p>Hi ${name}, a replacement mission has been generated:</p>
    <p class="meta">${title}</p>
    <a href="${reviewUrl}" class="btn">Review new mission →</a>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `New mission: ${data.missionTitle}\n\nReview it here:\n${reviewUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 6. GitHub commit success
// --------------------------------------------------------------------------

export function commitSuccessTemplate(data: {
  recipientName: string;
  missionTitle: string;
  repositoryFullName: string;
  branch: string;
  filePath: string;
  commitMessage: string;
  commitUrl: string;
  commitSha: string;
  taskId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Commit created — mission complete";
  const name = escHtml(data.recipientName);
  const title = escHtml(data.missionTitle);
  const repo = escHtml(data.repositoryFullName);
  const branch = escHtml(data.branch);
  const filePath = escHtml(data.filePath);
  const commitMsg = escHtml(data.commitMessage);
  const sha = data.commitSha.slice(0, 8);
  const tasksUrl = appUrl("/tasks");

  const html = layout(
    subject,
    `<h1>Commit created ✓</h1>
    <p>Hi ${name}, your mission has been committed to GitHub.</p>
    <p class="meta"><strong>Mission:</strong> ${title}</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 0;color:#6B7D71;width:120px">Repository</td><td style="font-family:monospace">${repo}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7D71">Branch</td><td style="font-family:monospace">${branch}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7D71">File</td><td style="font-family:monospace">${filePath}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7D71">Commit</td><td style="font-family:monospace">${commitMsg} (${sha})</td></tr>
    </table>
    <a href="${escHtml(data.commitUrl)}" class="btn">View on GitHub →</a>
    <p style="margin-top:16px"><a href="${tasksUrl}" style="color:#2E9D5B">← Back to Tasks</a></p>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Mission committed: ${data.missionTitle}\n\nRepository: ${data.repositoryFullName}\nBranch: ${data.branch}\nFile: ${data.filePath}\nCommit: ${data.commitMessage} (${sha})\n\nView on GitHub:\n${data.commitUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 7. GitHub commit recoverable failure
// --------------------------------------------------------------------------

export function commitRecoverableFailureTemplate(data: {
  recipientName: string;
  missionTitle: string;
  repositoryFullName: string;
  taskId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Action required — verify your GitHub commit";
  const name = escHtml(data.recipientName);
  const title = escHtml(data.missionTitle);
  const repo = escHtml(data.repositoryFullName);
  const dashUrl = appUrl("/dashboard");

  const html = layout(
    subject,
    `<h1>Please check your GitHub repository</h1>
    <p>Hi ${name}, something went wrong while saving the result of your mission commit:</p>
    <p class="meta">${title} → ${repo}</p>
    <div class="notice"><strong>Important:</strong> The commit may have been created on GitHub, but Blumo could not confirm it. Please check your GitHub repository before retrying. Do not retry if the commit already exists — that could create a duplicate.</div>
    <a href="https://github.com/${escHtml(data.repositoryFullName)}" class="btn">Open repository on GitHub →</a>
    <p><a href="${dashUrl}" style="color:#2E9D5B">Return to dashboard →</a></p>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Action required for mission: ${data.missionTitle}\n\nThe commit may have been created on GitHub but was not confirmed by Blumo. Check your repository before retrying:\nhttps://github.com/${data.repositoryFullName}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 8. GitHub installation suspended
// --------------------------------------------------------------------------

export function installationSuspendedTemplate(data: {
  recipientName: string;
  accountLogin: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "GitHub access suspended — Blumo cannot create commits";
  const name = escHtml(data.recipientName);
  const account = escHtml(data.accountLogin);

  const html = layout(
    subject,
    `<h1>GitHub access suspended</h1>
    <p>Hi ${name}, the Blumo GitHub App installation for <strong>${account}</strong> has been suspended.</p>
    <p>Blumo cannot create commits until the installation is restored. Your missions and progress are safe.</p>
    <a href="https://github.com/settings/installations" class="btn">Manage GitHub access →</a>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `GitHub access suspended for: ${data.accountLogin}\n\nBlumo cannot create commits until the installation is restored.\nhttps://github.com/settings/installations`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 9. GitHub App uninstalled
// --------------------------------------------------------------------------

export function installationUninstalledTemplate(data: {
  recipientName: string;
  accountLogin: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Blumo GitHub App uninstalled";
  const name = escHtml(data.recipientName);
  const account = escHtml(data.accountLogin);
  const connectUrl = appUrl("/github/connect");

  const html = layout(
    subject,
    `<h1>GitHub App uninstalled</h1>
    <p>Hi ${name}, the Blumo GitHub App was uninstalled from <strong>${account}</strong>.</p>
    <p>Blumo cannot create commits until you reconnect. Your missions and progress history remain safe.</p>
    <a href="${connectUrl}" class="btn">Reconnect GitHub →</a>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Blumo GitHub App was uninstalled from: ${data.accountLogin}\n\nReconnect:\n${connectUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 10. Repository access removed
// --------------------------------------------------------------------------

export function repositoryAccessRemovedTemplate(data: {
  recipientName: string;
  repositoryFullName: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Repository access removed";
  const name = escHtml(data.recipientName);
  const repo = escHtml(data.repositoryFullName);
  const repoUrl = appUrl("/github/repositories");

  const html = layout(
    subject,
    `<h1>Repository access removed</h1>
    <p>Hi ${name}, Blumo's access to <strong class="meta">${repo}</strong> has been removed.</p>
    <p>Blumo can no longer create commits in that repository. If this was intentional, no action is needed. To restore access, manage your GitHub App repositories.</p>
    <a href="${repoUrl}" class="btn">Manage repositories →</a>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Repository access removed: ${data.repositoryFullName}\n\nManage repositories:\n${repoUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 11. Weekly progress
// --------------------------------------------------------------------------

export function weeklyProgressTemplate(data: {
  recipientName: string;
  completedCount: number;
  weekLabel: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = `Your Blumo progress — ${data.weekLabel}`;
  const name = escHtml(data.recipientName);
  const week = escHtml(data.weekLabel);
  const count = data.completedCount;
  const historyUrl = appUrl("/history");

  const html = layout(
    subject,
    `<h1>Your week in review</h1>
    <p>Hi ${name}, here's your Blumo progress for <strong>${week}</strong>:</p>
    <p style="font-size:28px;font-weight:700;color:#2E9D5B;margin:16px 0">${count} mission${count !== 1 ? "s" : ""} completed</p>
    ${count > 0
      ? `<p>Great work! Each mission is a real contribution to your GitHub portfolio.</p>`
      : `<p>No missions were completed this week. That's okay — your next mission is ready when you are.</p>`}
    <a href="${historyUrl}" class="btn">View history →</a>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Progress for ${data.weekLabel}: ${count} mission${count !== 1 ? "s" : ""} completed.\n\nView history:\n${historyUrl}`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// 12. Support acknowledgement
// --------------------------------------------------------------------------

export function supportAcknowledgementTemplate(data: {
  recipientName: string;
  subject: string;
  ticketId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const emailSubject = `We received your message — Blumo Support (#${data.ticketId})`;
  const name = escHtml(data.recipientName);
  const ticketSubject = escHtml(data.subject);
  const ticketId = escHtml(data.ticketId);

  const html = layout(
    emailSubject,
    `<h1>We received your message</h1>
    <p>Hi ${name}, thanks for reaching out.</p>
    <p>We've received your message about: <strong>${ticketSubject}</strong></p>
    <p class="meta">Reference: #${ticketId}</p>
    <p>We'll follow up as soon as possible. ${data.replyTo ? `You can reply directly to this email.` : ``}</p>`,
    data.replyTo
  );

  const text = textLayout(
    emailSubject,
    `Hi ${data.recipientName},\n\nWe received your message about: ${data.subject}\n\nReference: #${data.ticketId}\n\nWe'll follow up soon.`
  );

  return { html: html, text, subject: emailSubject };
}

// --------------------------------------------------------------------------
// Test email
// --------------------------------------------------------------------------

export function testEmailTemplate(data: {
  recipientName: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Blumo email delivery test";
  const name = escHtml(data.recipientName);

  const html = layout(
    subject,
    `<h1>Email delivery is working</h1>
    <p>Hi ${name}, this is a test email from Blumo.</p>
    <p>If you received this, the Resend integration is configured correctly for your development environment.</p>
    <div class="notice">This email was sent from a development-only test action and will not appear in production.</div>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Hi ${data.recipientName}, this is a test email from Blumo.\n\nEmail delivery is working correctly.`
  );

  return { html, text, subject };
}

// --------------------------------------------------------------------------
// Auto-commit success
// --------------------------------------------------------------------------

export function autoCommitSuccessTemplate(data: {
  recipientName: string;
  missionTitle: string;
  repositoryFullName: string;
  branch: string;
  filePath: string;
  commitUrl: string;
  commitSha: string;
  taskId: string;
  replyTo?: string;
}): { html: string; text: string; subject: string } {
  const subject = "Your daily Blumo commit is live";
  const name = escHtml(data.recipientName);
  const title = escHtml(data.missionTitle);
  const repo = escHtml(data.repositoryFullName);
  const branch = escHtml(data.branch);
  const filePath = escHtml(data.filePath);
  const sha = data.commitSha.slice(0, 8);
  const tasksUrl = appUrl("/tasks");

  const html = layout(
    subject,
    `<h1>Daily commit live ✓</h1>
    <p>Hi ${name}, Blumo automatically committed your daily mission to GitHub.</p>
    <p class="meta"><strong>Mission:</strong> ${title}</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 0;color:#6B7D71;width:120px">Repository</td><td style="font-family:monospace">${repo}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7D71">Branch</td><td style="font-family:monospace">${branch}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7D71">File</td><td style="font-family:monospace">${filePath}</td></tr>
      <tr><td style="padding:4px 0;color:#6B7D71">SHA</td><td style="font-family:monospace">${sha}</td></tr>
    </table>
    <a href="${escHtml(data.commitUrl)}" class="btn">View on GitHub →</a>
    <div class="notice" style="margin-top:16px">This commit was made automatically by Blumo on your behalf. To stop auto-commits, turn off auto-commit in <a href="${tasksUrl}" style="color:#2E9D5B">Settings</a>.</div>`,
    data.replyTo
  );

  const text = textLayout(
    subject,
    `Daily mission committed: ${data.missionTitle}\n\nRepository: ${data.repositoryFullName}\nBranch: ${data.branch}\nFile: ${data.filePath}\nCommit: ${sha}\n\nView on GitHub:\n${data.commitUrl}\n\nThis commit was made automatically by Blumo. To disable auto-commits, visit Settings in the Blumo app.`
  );

  return { html, text, subject };
}

