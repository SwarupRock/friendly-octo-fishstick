import type { HealthState } from "../hooks/useHealth";

export function HealthBadge({ health }: { health: HealthState }) {
  const label =
    health.status === "online"
      ? `online · ${health.data.mode}`
      : health.status === "offline"
        ? "offline"
        : "checking…";

  return (
    <span className={`health-badge health-${health.status}`} title="Backend status">
      <span className="health-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
