// The convergence timeline: order placed → payment confirmed → fulfilled.
//
// Every step's state is derived from the SAME live Fulfillment the badge reads
// (lib/backend.ts), so the timeline and the header badge can never disagree on
// screen. We read `waitingFor` honestly rather than inferring which step is
// active — the backend tells us what it's still waiting on.

import type { Fulfillment } from "@/lib/backend";

type StepState = "done" | "active" | "idle";

interface Step {
  key: "order" | "payment" | "fulfilled";
  title: string;
  state: StepState;
  detail: string;
  at?: string | null;
}

function fmtTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? undefined
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/**
 * Build the three lifecycle steps from the live convergence state.
 * `live` is null before the first poll returns (or for a non-trackable order
 * we never poll) — in that case the steps show their pre-poll resting state.
 */
function buildSteps(live: Fulfillment | null): Step[] {
  const orderDone = !!live?.orderPlaced;
  const paymentDone = !!live?.paymentConfirmed;
  const fulfilled = !!live?.fulfilled;

  // "active" = the step the backend is currently waiting on (read from
  // waitingFor, not inferred), so it stays in lockstep with badgeFor.
  const waitingOrder = live ? live.waitingFor.includes("order-placed") : false;
  const waitingPayment = live ? live.waitingFor.includes("payment-confirmed") : false;

  return [
    {
      key: "order",
      title: "Order placed",
      state: orderDone ? "done" : waitingOrder ? "active" : "idle",
      detail: orderDone
        ? "Order received by the warehouse."
        : "Waiting for the order event…",
      at: live?.orderPlaced,
    },
    {
      key: "payment",
      title: "Payment confirmed",
      state: paymentDone ? "done" : waitingPayment ? "active" : "idle",
      detail: paymentDone
        ? "Payment confirmed."
        : "Waiting for payment confirmation…",
      at: live?.paymentConfirmed,
    },
    {
      key: "fulfilled",
      title: "Fulfilled",
      // Fulfilled only goes active once both prior events are in; otherwise idle.
      state: fulfilled ? "done" : orderDone && paymentDone ? "active" : "idle",
      detail: fulfilled
        ? "Both events converged — your order is complete."
        : "Completes once the order and payment events meet.",
    },
  ];
}

const DOT: Record<StepState, string> = {
  done: "border-emerald-500 bg-emerald-500 text-white",
  active: "border-amber-400 bg-amber-50 text-amber-600",
  idle: "border-stone-300 bg-white text-stone-300",
};

const TITLE: Record<StepState, string> = {
  done: "text-stone-900",
  active: "text-stone-900",
  idle: "text-stone-400",
};

export default function OrderTimeline({ live }: { live: Fulfillment | null }) {
  const steps = buildSteps(live);
  return (
    <ol data-testid="order-timeline" className="relative">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const time = fmtTime(step.at);
        return (
          <li
            key={step.key}
            data-testid={`timeline-step-${step.key}`}
            data-state={step.state}
            className="relative flex gap-4 pb-8 last:pb-0"
          >
            {/* connecting rail */}
            {!last && (
              <span
                aria-hidden
                className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px ${
                  step.state === "done" ? "bg-emerald-300" : "bg-stone-200"
                }`}
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${DOT[step.state]}`}
            >
              {step.state === "done" ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : step.state === "active" ? (
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-stone-300" />
              )}
            </span>
            <div className="pt-1">
              <div className="flex items-center gap-2">
                <p className={`font-medium ${TITLE[step.state]}`}>{step.title}</p>
                {time && (
                  <span
                    data-testid={`timeline-time-${step.key}`}
                    className="text-xs tabular-nums text-stone-400"
                  >
                    {time}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-stone-500">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
