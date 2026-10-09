import { useEffect, useState } from "react";

import { getHealth } from "../lib/api";
import type { HealthResponse } from "../lib/types";

export type HealthState =
  | { status: "loading"; data: null }
  | { status: "online"; data: HealthResponse }
  | { status: "offline"; data: null };

export function useHealth(pollMs = 15000): HealthState {
  const [state, setState] = useState<HealthState>({
    status: "loading",
    data: null,
  });

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const data = await getHealth();
        if (active) setState({ status: "online", data });
      } catch {
        if (active) setState({ status: "offline", data: null });
      }
    };

    void check();
    const id = window.setInterval(check, pollMs);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [pollMs]);

  return state;
}
