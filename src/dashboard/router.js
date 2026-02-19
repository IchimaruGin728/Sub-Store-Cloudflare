/**
 * Dashboard API 路由入口
 *
 * 说明：
 * - 这里只做路由归类（L2 DataOfficer）与编排调用（L2 Commander）
 * - 具体业务动作在 L3 Molecule（public/user/admin）
 */
import { parseDashboardRoute } from './orchestration/dataOfficer/dashboardRouteDataOfficer.js';
import { handle as dashboardCommanderHandle } from './orchestration/commander/dashboardCommander.js';

/**
 * Handle Dashboard API Requests
 * @param {Request} request 
 * @param {object} env 
 * @returns {Promise<Response|null>} Response if handled, null if not
 */
export async function handleDashboardRequest(request, env) {
    const route = parseDashboardRoute(request);
    return await dashboardCommanderHandle({ request, env, route });
}
