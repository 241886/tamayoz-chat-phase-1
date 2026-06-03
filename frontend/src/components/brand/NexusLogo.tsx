import clsx from "clsx";

type NexusLogoProps = {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: "h-9 w-9 text-sm",
  md: "h-11 w-11 text-base",
  lg: "h-16 w-16 text-2xl"
};

export function NexusLogo({ size = "md", showWordmark = true, className }: NexusLogoProps) {
  return (
    <div className={clsx("flex min-w-0 items-center gap-3", className)}>
      <div
        className={clsx(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-[#0F172A] font-bold text-white shadow-nexus ring-1 ring-white/10",
          sizeClasses[size]
        )}
        aria-hidden="true"
      >
        <span className="absolute inset-[5px] rounded-md bg-[#5865F2]" />
        <span className="absolute left-[28%] top-[25%] h-[50%] w-[12%] rounded-sm bg-white" />
        <span className="absolute right-[28%] top-[25%] h-[50%] w-[12%] rounded-sm bg-white" />
        <span className="absolute left-[43%] top-[23%] h-[54%] w-[12%] -rotate-[28deg] rounded-sm bg-white" />
      </div>
      {showWordmark ? (
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-normal text-slate-950 dark:text-white">Nexus</p>
          <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Connect. Collaborate. Create.
          </p>
        </div>
      ) : null}
    </div>
  );
}
