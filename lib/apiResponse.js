export function success(data = {}, status = 200) {
    return Response.json({
        success: true,
        data
    }, { status })
}

export function failure(message = 'Internal Server Error', status = 500) {
    return Response.json({
        success: false,
        error: message
    }, { status })
}