/**
 * TokenIndicator Component
 * Shows token usage with a visual progress bar
 */
import { useMemo } from "react";
import { cn } from "@/lib/shared-utilities/cn";

interface TokenIndicatorProps {
  percentage: number;
  tooltip?: string;
  totalTokens?: number;
  contextWindow?: number;
}

export function TokenIndicator({
  percentage,
  tooltip,
  totalTokens,
  contextWindow = 200000
}: TokenIndicatorProps) {
  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
  };

  const displayText = useMemo(() => {
    if (totalTokens !== undefined) {
      return `${formatNumber(totalTokens)} / ${formatNumber(contextWindow)}`;
    }
    return `${percentage.toFixed(1)}%`;
  }, [percentage, totalTokens, contextWindow]);

  const barColor = useMemo(() => {
    if (percentage < 50) return "bg-green-500";
    if (percentage < 75) return "bg-yellow-500";
    if (percentage < 90) return "bg-orange-500";
    return "bg-red-500";
  }, [percentage]);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-hover transition-colors group"
      title={tooltip || `${percentage.toFixed(1)}% of context window used`}
    >
      <div className="w-16 h-1.5 bg-bg3 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-300 rounded-full", barColor)}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
      <span className="text-[10px] text-t4 font-mono min-w-[60px] text-right group-hover:text-t3 transition-colors">
        {displayText}
      </span>
    </div>
  );
}
