export default function ConnectLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="h-8 w-72 rounded-lg bg-muted animate-pulse" />
      <div className="h-48 w-full rounded-xl bg-muted animate-pulse" />
      <div className="h-10 w-44 rounded-lg bg-muted animate-pulse" />
      <div className="h-4 w-96 rounded bg-muted animate-pulse" />
    </div>
  );
}
