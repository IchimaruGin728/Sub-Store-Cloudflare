/**
 * L2 - Data Officer
 * 只负责 cron settings 的解析/归一化（数字化、范围裁剪、默认值）。
 */

export function normalizeCronSettings(settings) {
    const batchSize = Math.max(1, parseInt(settings?.cronBatchSize ?? 50, 10));
    const maxUsers = Math.max(0, parseInt(settings?.cronMaxUsers ?? 200, 10));
    const timeBudgetMs = Math.max(1000, parseInt(settings?.cronTimeBudgetMs ?? 20000, 10));
    const lastUserId = Math.max(0, parseInt(settings?.cronLastUserId ?? 0, 10));

    return { batchSize, maxUsers, timeBudgetMs, lastUserId };
}

