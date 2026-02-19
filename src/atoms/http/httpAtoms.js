export function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...extraHeaders,
        },
    });
}

export function errorResponse(message, status = 400, extraHeaders = {}) {
    return jsonResponse({ error: message }, status, extraHeaders);
}

export function binaryResponse(body, status = 200, extraHeaders = {}) {
    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'application/octet-stream',
            ...extraHeaders,
        },
    });
}

export async function readJsonBody(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

export function buildNotFoundResponse() {
    return new Response('Not Found', { status: 404 });
}

export function buildCorsPreflightResponse() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST,GET,OPTIONS,PATCH,PUT,DELETE',
            'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
        },
    });
}

export function addRequestIdHeaderToResponse(response, requestId) {
    try {
        if (!response || !requestId) return response;
        if (response.headers?.get?.('X-Request-Id')) return response;
        const headers = new Headers(response.headers);
        headers.set('X-Request-Id', requestId);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch {
        return response;
    }
}
