import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

const APP_MILESTONES = [
  { days: 7, title: "Sankalpa" },
  { days: 21, title: "Sthirata" },
  { days: 48, title: "Ananda" },
  { days: 90, title: "Paramananda" },
];

const MEMBERSHIP_PLAN_LABELS: Record<string, string> = {
  app: "YogaUnnati App",
  online: "YogaUnnati Online",
  studio: "YogaUnnati Studio",
};

type NotificationType = "night" | "morning" | "missed" | "membership_overdue";
type RequestPayload = {
  force_type?: NotificationType;
};

type MembershipReminderInput = {
  planCode: string;
  status: string;
  currentPeriodEnd: string | null;
};

webpush.setVapidDetails(
  "mailto:you@example.com",
  vapidPublicKey,
  vapidPrivateKey,
);

const supabase = createClient(supabaseUrl, serviceRoleKey);

function parseLocalDate(dateString: string) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function normalizePracticeDates(practiceDates: string[]) {
  return [...new Set(practiceDates)].sort();
}

function getRelativeIsoDate(baseIsoDate: string, offsetDays: number) {
  const date = parseLocalDate(baseIsoDate);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getZonedParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });

  const parts = formatter.formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getZonedNow(timeZone: string) {
  const map = getZonedParts(new Date(), timeZone);

  return {
    timeZone,
    isoDate: `${map.year}-${map.month}-${map.day}`,
    weekday: map.weekday || "",
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
  };
}

function getZonedIsoDate(value: string | Date, timeZone: string) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const map = getZonedParts(parsed, timeZone);
  return `${map.year}-${map.month}-${map.day}`;
}

function getMembershipPlanLabel(planCode: string) {
  return MEMBERSHIP_PLAN_LABELS[planCode] || "YogaUnnati membership";
}

function getMilestoneProgressCount(practiceDates: string[], referenceDate: Date) {
  const uniqueDates = normalizePracticeDates(practiceDates);

  if (uniqueDates.length === 0) {
    return 0;
  }

  const firstPracticeDate = new Date(`${uniqueDates[0]}T00:00:00`);
  const reference = new Date(referenceDate);
  reference.setHours(0, 0, 0, 0);

  if (reference < firstPracticeDate) {
    return uniqueDates.length;
  }

  const practicedSet = new Set(uniqueDates);
  let consecutiveMisses = 0;
  let maxPenalty = 0;

  for (
    let cursor = new Date(firstPracticeDate);
    cursor <= reference;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    const formatted = `${yyyy}-${mm}-${dd}`;

    if (practicedSet.has(formatted)) {
      consecutiveMisses = 0;
      continue;
    }

    consecutiveMisses += 1;
    maxPenalty += Math.floor(consecutiveMisses / 2) > Math.floor((consecutiveMisses - 1) / 2) ? 1 : 0;
  }

  return Math.max(0, uniqueDates.length - maxPenalty);
}

function getCurrentMilestoneState(totalDays: number) {
  const uniqueTotalDays = Math.max(0, totalDays);
  let index = 0;

  for (let i = 1; i < APP_MILESTONES.length; i += 1) {
    if (uniqueTotalDays >= APP_MILESTONES[i - 1].days) {
      index = i;
    }
  }

  const milestone = APP_MILESTONES[index];

  return {
    milestone,
    index,
    completedWithinMilestone: Math.min(uniqueTotalDays, milestone.days),
    totalWithinMilestone: milestone.days,
    remainingDays: Math.max(0, milestone.days - uniqueTotalDays),
  };
}

function getNextDayNumber(state: ReturnType<typeof getCurrentMilestoneState>) {
  return Math.min(state.completedWithinMilestone + 1, state.totalWithinMilestone);
}

function calculateCurrentStreak(practiceDates: string[], todayIsoDate: string) {
  const dates = normalizePracticeDates(practiceDates).sort().reverse();
  let streak = 0;
  let compareDate = parseLocalDate(todayIsoDate);
  compareDate.setHours(0, 0, 0, 0);

  for (const dateString of dates) {
    const date = parseLocalDate(dateString);
    const diff = Math.floor((compareDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diff === 0 || diff === 1) {
      streak += 1;
      compareDate = date;
    } else {
      break;
    }
  }

  return streak;
}

function getScheduledNotificationType(hour: number, minute: number): NotificationType | null {
  if (hour === 21 && minute >= 0 && minute < 15) {
    return "night";
  }

  if (hour === 5 && minute >= 15 && minute < 30) {
    return "morning";
  }

  return null;
}

function isMembershipOverdue(
  membership: MembershipReminderInput | null | undefined,
  zoneIsoDate: string,
  timeZone: string,
) {
  if (!membership || !membership.planCode || membership.planCode === "none") {
    return false;
  }

  if (membership.status === "past_due") {
    return true;
  }

  if (!membership.currentPeriodEnd) {
    return false;
  }

  const dueIsoDate = getZonedIsoDate(membership.currentPeriodEnd, timeZone);
  return Boolean(dueIsoDate) && dueIsoDate < zoneIsoDate;
}

function buildScheduledMessage(
  type: NotificationType,
  nextDayNumber: number,
  practicedToday: boolean,
  remainingDays: number,
  streak: number,
  membershipPlanLabel = "",
) {
  if (type === "membership_overdue") {
    return `Namaskaram \uD83D\uDE4F ${membershipPlanLabel} membership is overdue. Tap to continue.`;
  }

  if (type === "morning") {
    return `Day ${nextDayNumber} starts soon!`;
  }

  if (!practicedToday) {
    if (streak > 2) {
      return `Protect your ${streak}-day streak. Join tomorrow!`;
    }

    if (remainingDays > 0) {
      const dayLabel = remainingDays === 1 ? "day" : "days";
      return `Stay on track. ${remainingDays} ${dayLabel} to your next milestone.`;
    }

    return "Stay on track. Join tomorrow!";
  }

  return `Tomorrow is Day ${nextDayNumber}. See you!`;
}

async function alreadySent(
  subscriptionId: string,
  notificationType: NotificationType,
  localDate: string,
) {
  const { data, error } = await supabase
    .from("push_notification_log")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("notification_type", notificationType)
    .eq("local_date", localDate)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function markSent(
  userId: string,
  subscriptionId: string,
  notificationType: NotificationType,
  localDate: string,
) {
  const { error } = await supabase
    .from("push_notification_log")
    .insert({
      user_id: userId,
      subscription_id: subscriptionId,
      notification_type: notificationType,
      local_date: localDate,
    });

  if (error) {
    throw error;
  }
}

Deno.serve(async (req) => {
  let payload: RequestPayload = {};

  try {
    payload = await req.json();
  } catch (_error) {
    payload = {};
  }

  const isForcedRun = Boolean(payload.force_type);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id, timezone")
    .eq("enabled", true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const subscriptions = subs ?? [];
  const userIds = [...new Set(subscriptions.map((sub) => sub.user_id).filter(Boolean))];
  const practiceLogMap = new Map<string, string[]>();
  const membershipMap = new Map<string, MembershipReminderInput>();

  if (userIds.length) {
    const [{ data: logs, error: logsError }, { data: memberships, error: membershipsError }] = await Promise.all([
      supabase
        .from("practice_logs")
        .select("user_id, date")
        .in("user_id", userIds),
      supabase
        .from("memberships")
        .select("user_id, plan_code, status, current_period_end")
        .in("user_id", userIds),
    ]);

    if (logsError) {
      return new Response(JSON.stringify({ error: logsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (membershipsError) {
      return new Response(JSON.stringify({ error: membershipsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const log of logs ?? []) {
      if (!practiceLogMap.has(log.user_id)) {
        practiceLogMap.set(log.user_id, []);
      }
      practiceLogMap.get(log.user_id)!.push(log.date);
    }

    for (const membership of memberships ?? []) {
      membershipMap.set(membership.user_id, {
        planCode: String(membership.plan_code || "none"),
        status: String(membership.status || "inactive"),
        currentPeriodEnd: membership.current_period_end || null,
      });
    }
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let disabled = 0;

  for (const sub of subscriptions) {
    try {
      const zone = getZonedNow(sub.timezone || "UTC");
      const scheduledType = payload.force_type || getScheduledNotificationType(zone.hour, zone.minute);
      const membership = membershipMap.get(sub.user_id);
      const notificationType = payload.force_type
        || (scheduledType === "night" && isMembershipOverdue(membership, zone.isoDate, zone.timeZone)
          ? "membership_overdue"
          : scheduledType);

      if (!notificationType) {
        skipped += 1;
        continue;
      }

      if (!isForcedRun) {
        const alreadyLogged = await alreadySent(sub.id, notificationType, zone.isoDate);
        if (alreadyLogged) {
          skipped += 1;
          continue;
        }
      }

      const practiceDates = practiceLogMap.get(sub.user_id) ?? [];
      const practicedSet = new Set(normalizePracticeDates(practiceDates));
      const practicedToday = practicedSet.has(zone.isoDate);
      const progressCount = getMilestoneProgressCount(practiceDates, parseLocalDate(zone.isoDate));
      const state = getCurrentMilestoneState(progressCount);
      const nextDayNumber = getNextDayNumber(state);
      const streak = calculateCurrentStreak(practiceDates, zone.isoDate);
      const message = buildScheduledMessage(
        notificationType,
        nextDayNumber,
        practicedToday,
        state.remainingDays,
        streak,
        getMembershipPlanLabel(membership?.planCode || "none"),
      );

      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify({
          title: "YogaUnnati",
          body: message,
          data: {
            url: notificationType === "membership_overdue" ? "./membership.html?from=home" : "./index.html",
            type: notificationType,
          },
        }),
      );

      if (!isForcedRun) {
        await markSent(sub.user_id, sub.id, notificationType, zone.isoDate);
      }
      sent += 1;
    } catch (err) {
      failed += 1;

      const statusCode = Number((err as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        const { error: disableError } = await supabase
          .from("push_subscriptions")
          .update({ enabled: false })
          .eq("id", sub.id);

        if (!disableError) {
          disabled += 1;
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, failed, disabled }), {
    headers: { "Content-Type": "application/json" },
  });
});
