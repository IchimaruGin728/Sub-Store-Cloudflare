import { DurableObject } from 'cloudflare:workers';
import { Storage } from '@cloudflare/actors/storage';
import { getRequestId, initLogger, debug, error as logError } from '../utils/logger.js';
import { errorResponse } from '../atoms/http/httpAtoms.js';
import { ensureUserDoSchema } from '../atoms/userSql/userSqlAtoms.js';
import { handle as handleUserDoRequest } from '../orchestration/commander/userDoCommander.js';


export class UserDO extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.state = state;
        this.env = env;
        this.storage = new Storage(state.storage);

        // schema 初始化下沉到 atom，避免在入口文件中散落 SQL
        ensureUserDoSchema(state.storage.sql, this.storage);
    }

    async fetch(request) {
        initLogger(this.env);
        const requestId = getRequestId(request);
        const url = new URL(request.url);
        debug(`[UserDO] [${requestId}] ${request.method} ${url.pathname}`);

        try {
            return await handleUserDoRequest({
                request,
                env: this.env,
                state: this.state,
                storage: this.storage,
                requestId,
            });
        } catch (err) {
            logError(`[UserDO] [${requestId}] unhandled error:`, err?.message || err);
            return errorResponse('Internal Server Error', 500);
        }
    }
}
