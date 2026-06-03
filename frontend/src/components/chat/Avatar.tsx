import clsx from "clsx";
import type { User } from "@/types/chat";

type AvatarProps = {
  user?: Pick<User, "name" | "avatarUrl" | "status"> | null;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-9 w-9 text-sm",
  md: "h-11 w-11 text-base",
  lg: "h-12 w-12 text-lg"
};

export function Avatar({ user, size = "md" }: AvatarProps) {
  const initials =
    user?.name
      ?.split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "NX";

  return (
    <div className="relative shrink-0">
      <div
        className={clsx(
          "grid place-items-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 font-semibold text-white",
          "shadow-[0_0_22px_rgba(200,122,255,0.2)] ring-1 ring-white/10",
          sizes[size]
        )}
      >
        {user?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {user?.status ? (
        <span
          className={clsx(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#12101a]",
            user.status === "ONLINE" ? "online-glow" : "bg-white/25"
          )}
        />
      ) : null}
    </div>
  );
}
