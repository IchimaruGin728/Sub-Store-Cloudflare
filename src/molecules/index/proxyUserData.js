/**
 * L3 - Molecule
 * IndexDO：透传用户 data（读/写/删）到 UserDO。
 */

import { jsonResponse, errorResponse } from '../../atoms/http/httpAtoms.js';
import { readJsonBody } from '../../atoms/http/httpAtoms.js';
import { getUserDataFromUserDo } from '../../atoms/cf/bindings.js';
import { putUserDataToUserDo } from '../../atoms/cf/bindings.js';
import { deleteUserDataFromUserDo } from '../../atoms/cf/bindings.js';

export async function proxyUserData({ request, env, requestId, route }) {
    const userId = route.userId || 0;
    if (!userId) return errorResponse('userId required', 400);

    if (route.method === 'GET') {
        const data = await getUserDataFromUserDo({ env, userId, requestId });
        return jsonResponse({ data });
    }

    if (route.method === 'PUT') {
        const body = (await readJsonBody(request)) || {};
        const ok = await putUserDataToUserDo({ env, userId, data: body?.data ?? {}, requestId });
        return jsonResponse({ ok });
    }

    if (route.method === 'DELETE') {
        const ok = await deleteUserDataFromUserDo({ env, userId, requestId });
        return jsonResponse({ ok });
    }

    return errorResponse('Method Not Allowed', 405);
}
