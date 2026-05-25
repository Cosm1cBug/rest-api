export function success(data = {}, status = 200, headers = {}) {
    return Response.json(
        { success: true, data },
        { status, headers }
    )
}

export function failure(message = 'Internal Server Error', status = 500, headers = {}) {
    return Response.json(
        { success: false, error: message },
        { status, headers }
    )
}
