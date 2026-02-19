/**
 * L2 - Commander
 * IndexDO 入口编排：只负责分发到对应 L3 molecule，不实现业务逻辑/SQL。
 */

import { parseIndexDoRoute } from '../dataOfficer/indexDoRouteDataOfficer.js';
import { mergeSystemSettings, mergeSystemSettingsPatch } from '../dataOfficer/systemSettingsDataOfficer.js';
import { getSettings } from '../../molecules/index/getSettings.js';
import { patchSettings } from '../../molecules/index/patchSettings.js';
import { getUserByPath } from '../../molecules/index/getUserByPath.js';
import { listUsers } from '../../molecules/index/listUsers.js';
import { updateAvatar } from '../../molecules/index/updateAvatar.js';
import { proxyUserData } from '../../molecules/index/proxyUserData.js';
import { getMmdbMeta } from '../../molecules/index/getMmdbMeta.js';
import { getMmdbFile } from '../../molecules/index/getMmdbFile.js';
import { putMmdbFile } from '../../molecules/index/putMmdbFile.js';
import { handleDashboardApiViaDashboardCommander } from '../diplomat/dashboardApiViaDashboardCommanderDiplomat.js';
import { buildNotFoundResponse } from '../../atoms/http/httpAtoms.js';

export async function handle({ request, env, storage, requestId }) {
    const route = parseIndexDoRoute(request);

    if (route.kind === 'settings-get') {
        return await getSettings({ request, env, storage, requestId, mergeSettings: mergeSystemSettings });
    }

    if (route.kind === 'settings-patch') {
        return await patchSettings({
            request,
            env,
            storage,
            requestId,
            mergeSettings: mergeSystemSettings,
            mergePatch: mergeSystemSettingsPatch,
        });
    }

    if (route.kind === 'user-by-path') {
        return await getUserByPath({ request, env, storage, requestId, route });
    }

    if (route.kind === 'users-list') {
        return await listUsers({ request, env, storage, requestId, route });
    }

    if (route.kind === 'users-avatar') {
        return await updateAvatar({ request, env, storage, requestId });
    }

    if (route.kind === 'user-data') {
        return await proxyUserData({ request, env, storage, requestId, route });
    }

    if (route.kind === 'dashboard-api') {
        return await handleDashboardApiViaDashboardCommander({ request, env, storage, requestId });
    }

    if (route.kind === 'mmdb-meta') {
        return await getMmdbMeta({ request, env, storage, requestId, route });
    }

    if (route.kind === 'mmdb-file-get') {
        return await getMmdbFile({ request, env, storage, requestId, route });
    }

    if (route.kind === 'mmdb-file-put') {
        return await putMmdbFile({ request, env, storage, requestId, route });
    }

    return buildNotFoundResponse();
}
