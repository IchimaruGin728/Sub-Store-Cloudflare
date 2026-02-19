/**
 * L3 - Molecule
 * Cron 批处理：遍历用户并触发每个用户的 cron，同步游标。
 */

import { info, error as logError } from '../../utils/logger.js';
import { getSettingsFromIndexDo } from '../../atoms/cf/bindings.js';
import { listUsersFromIndexDo } from '../../atoms/cf/bindings.js';
import { patchSettingsToIndexDo } from '../../atoms/cf/bindings.js';
import { triggerUserCron } from '../../atoms/cf/bindings.js';

export async function runCronBatch({ env, settingsNormalizer }) {
    info('[Cron] 开始执行定时任务...');

    try {
        const rawSettings = await getSettingsFromIndexDo({ env, requestId: 'cron' });
        const { batchSize, maxUsers, timeBudgetMs, lastUserId } = settingsNormalizer(rawSettings);

        let processed = 0;
        let lastProcessedId = lastUserId;
        let finishedAll = false;
        let stopReason = '';
        const startTime = Date.now();

        outer: while (true) {
            if (Date.now() - startTime > timeBudgetMs) {
                stopReason = 'time-budget';
                break;
            }

            const page = await listUsersFromIndexDo({
                env,
                afterId: lastProcessedId,
                limit: batchSize,
                requestId: 'cron',
            });
            const users = page?.results || [];
            if (users.length === 0) {
                finishedAll = true;
                break;
            }

            for (const user of users) {
                if (maxUsers > 0 && processed >= maxUsers) {
                    stopReason = 'max-users';
                    break outer;
                }
                if (Date.now() - startTime > timeBudgetMs) {
                    stopReason = 'time-budget';
                    break outer;
                }

                await triggerUserCron({ env, user, requestId: 'cron' });
                processed += 1;
                lastProcessedId = user.id;
            }
        }

        if (finishedAll) {
            await patchSettingsToIndexDo({ env, patch: { cronLastUserId: 0 }, requestId: 'cron' });
        } else if (lastProcessedId > 0) {
            await patchSettingsToIndexDo({ env, patch: { cronLastUserId: lastProcessedId }, requestId: 'cron' });
        }

        if (stopReason === 'max-users') {
            info(`[Cron] 已达到本次最大处理上限: ${maxUsers}`);
        } else if (stopReason === 'time-budget') {
            info(`[Cron] 超出时间预算(${timeBudgetMs}ms)，提前结束`);
        }

        info(`[Cron] 定时任务执行完成，处理用户数: ${processed}`);
        return { processed, finishedAll, stopReason };
    } catch (err) {
        logError('[Cron] 定时任务执行失败:', err?.message || err);
        return { processed: 0, finishedAll: false, stopReason: 'error' };
    }
}
