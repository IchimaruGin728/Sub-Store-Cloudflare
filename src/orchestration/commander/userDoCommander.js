/**
 * L2 - Commander
 * UserDO 入口编排：只负责分发到对应 L3 molecule，不实现业务逻辑/SQL。
 */

import { parseUserDoRoute } from '../dataOfficer/userDoRouteDataOfficer.js';
import { listAccessLog } from '../../molecules/user/listAccessLog.js';
import { getUserDataString } from '../../molecules/user/getUserDataString.js';
import { putUserDataString } from '../../molecules/user/putUserDataString.js';
import { deleteUserDataString } from '../../molecules/user/deleteUserDataString.js';
import { runUserCron } from '../../molecules/user/runUserCron.js';
import { forwardToSubStore } from '../../molecules/user/forwardToSubStore.js';
import { buildNotFoundResponse } from '../../atoms/http/httpAtoms.js';

export async function handle({ request, env, state, storage, requestId }) {
    const route = parseUserDoRoute(request);

    if (route.kind === 'access-log') {
        return await listAccessLog({ request, env, storage, requestId, route });
    }

    if (route.kind === 'user-data-get') {
        return await getUserDataString({ request, env, storage, requestId, route });
    }

    if (route.kind === 'user-data-put') {
        return await putUserDataString({ request, env, storage, requestId, route });
    }

    if (route.kind === 'user-data-delete') {
        return await deleteUserDataString({ request, env, storage, requestId, route });
    }

    if (route.kind === 'cron') {
        return await runUserCron({ request, env, state, storage, requestId, route });
    }

    if (route.kind === 'substore') {
        return await forwardToSubStore({ request, env, state, storage, requestId, route });
    }

    return buildNotFoundResponse();
}

