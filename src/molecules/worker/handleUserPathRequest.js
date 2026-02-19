/**
 * L3 - Molecule
 * 处理用户路径请求：
 * - 通过 IndexDO 根据 userPath 查询用户
 * - 转发到对应 UserDO 的 Sub-Store 入口
 */

import { getUserByPathFromIndexDo } from '../../atoms/cf/bindings.js';
import { forwardRequestToUserDoSubStore } from '../../atoms/cf/bindings.js';
import { buildNotFoundResponse } from '../../atoms/http/httpAtoms.js';

export async function handleUserPathRequest({ request, env, requestId, route }) {
    const userPath = route.user.userPath;
    const user = await getUserByPathFromIndexDo({ env, userPath, requestId });
    if (!user) return buildNotFoundResponse();

    return await forwardRequestToUserDoSubStore({ request, env, user, requestId });
}
