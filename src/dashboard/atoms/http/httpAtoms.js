export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
};

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

export function errorResponse(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), { status, headers: corsHeaders });
}

export function okResponse(data = {}) {
    return jsonResponse({ status: 'ok', ...data });
}

export function buildApiPreflightResponse() {
    return new Response(null, { headers: corsHeaders });
}
