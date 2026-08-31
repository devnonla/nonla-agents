import { useState } from "react";
import Avatar, { genConfig } from "react-nice-avatar";

interface UserAvatarProps {
  avatar?: string | null;
  name?: string | null;
  className?: string;
  size?: number;
}

export function UserAvatar({ avatar, name, className, size = 32 }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  // Check if avatar is a nice-avatar JSON config
  let config: any = null;
  if (avatar?.startsWith("{") && avatar.endsWith("}")) {
    try {
      config = JSON.parse(avatar);
    } catch (_e) {
      // Not a valid JSON, treat as URL
    }
  }

  if (config) {
    return (
      <div className={["rounded-full overflow-hidden", className].filter(Boolean).join(" ")} style={{ width: size, height: size }}>
        <Avatar style={{ width: "100%", height: "100%" }} {...config} />
      </div>
    );
  }

  if (avatar && !avatar.startsWith("{") && !imgError) {
    return (
      <div className={["rounded-full overflow-hidden", className].filter(Boolean).join(" ")} style={{ width: size, height: size }}>
        <img src={avatar} alt={name || "User Avatar"} className="w-full h-full object-cover rounded-full" onError={() => setImgError(true)} />
      </div>
    );
  }

  // Fallback to a default generated avatar if none provided
  // We use the name as a seed to keep it consistent for each user
  return (
    <div className={["rounded-full overflow-hidden", className].filter(Boolean).join(" ")} style={{ width: size, height: size }}>
      <Avatar style={{ width: "100%", height: "100%" }} {...genConfig(name || "")} />
    </div>
  );
}

export { genConfig };
